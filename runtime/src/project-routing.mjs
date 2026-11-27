import { RuntimeBlockedError } from "./contracts.mjs";
const deny = message => { throw new RuntimeBlockedError(message); };
const id = s => typeof s === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(s);
const sha = s => typeof s === "string" && /^[a-f0-9]{64}$/i.test(s);
const record = o => o !== null && typeof o === "object" && !Array.isArray(o);
const list = a => Array.isArray(a) && a.every(id) && new Set(a).size===a.length;
const intents = Object.freeze(["legal-knowledge","legal-publish","hotspot-writing","chat-video","narration","motion-video","story-video","video-extension","identity-context","skill-discovery"]);
// Registry supplied by trusted control plane, not model text. No repository URLs or executable commands in routing output.
export function validateProjectCatalog(catalog) {
  if (!record(catalog) || catalog.schemaVersion!==1 || !Array.isArray(catalog.projects) || !catalog.projects.length) deny("Invalid project catalog.");
  const seen = new Set();
  for(const p of catalog.projects) {
    if(!record(p)||!id(p.id)||seen.has(p.id)||!list(p.intents)||!p.intents.length||
       p.intents.some(i=>!intents.includes(i))||!["reference","workflow","asset"].includes(p.kind)||
       !["draft","disabled"].includes(p.status)) deny("Invalid project entry.");
    seen.add(p.id);
  }
  return catalog;
}
export async function proposeProjectRoute({catalog,intent,preferredId,authorizeRead}) {
  validateProjectCatalog(catalog);
  if(!intents.includes(intent)||typeof authorizeRead!=="function"||(preferredId!==undefined&&!id(preferredId))) deny("Invalid route request.");
  const matches=[];
  for(const p of catalog.projects) {
    if(p.status!=="draft"||!p.intents.includes(intent)||(preferredId&&p.id!==preferredId)) continue;
    if(await authorizeRead({projectId:p.id,intent})===true) matches.push({id:p.id,kind:p.kind});
  }
  return {status:matches.length===1?"proposed":matches.length?"choice_required":"unavailable",intent,candidates:matches,execution:"not_authorized"};
}

// Pure DAG planning: hashes and artifact verification must come from the trusted controller.
// No model calls, filesystem access, job launches or automatic retry of ambiguous submissions.
export function planExecution({nodes,states={},maxCalls,callsUsed=0,maxAttempts=2}) {
  if(!Array.isArray(nodes)||!nodes.length||!record(states)||!Number.isSafeInteger(maxCalls)||maxCalls<0||
    !Number.isSafeInteger(callsUsed)||callsUsed<0||!Number.isSafeInteger(maxAttempts)||maxAttempts<1) deny("Invalid execution limits.");
  const map=new Map();
  for(const n of nodes) {
    if(!record(n)||!id(n.id)||map.has(n.id)||!list(n.deps)||!sha(n.inputHash)) deny("Invalid execution node.");
    map.set(n.id,n);
  }
  for(const key of Object.keys(states)) if(!map.has(key)) deny("Unknown state node.");
  const ordered=[], visiting=new Set(),visited=new Set();
  function visit(key) {
    if(visiting.has(key)||!map.has(key)) deny("Cyclic or missing dependency.");
    if(visited.has(key))return;
    visiting.add(key);for(const d of map.get(key).deps)visit(d);
    visiting.delete(key);visited.add(key);ordered.push(map.get(key));
  }
  for(const n of nodes)visit(n.id);
  const valid=new Map(),results=[];
  let slots=Math.max(0,maxCalls-callsUsed);
  for(const n of ordered) {
    const s=Object.hasOwn(states,n.id)?states[n.id]:undefined;
    if(s!==undefined&&(!record(s)||!["verified","failed","unknown","running","quota_blocked"].includes(s.status)||
      !Number.isSafeInteger(s.attempts)||s.attempts<0))deny("Invalid execution state.");
    const depsReady=n.deps.every(d=>valid.has(d));
    const dependencyHashes=Object.fromEntries(n.deps.filter(d=>valid.has(d)).map(d=>[d,valid.get(d)]));
    const oldDeps=s?.dependencyHashes;
    const exactDeps=record(oldDeps)&&Object.keys(oldDeps).length===n.deps.length&&n.deps.every(d=>Object.hasOwn(oldDeps,d)&&oldDeps[d]===dependencyHashes[d]);
    let status;
    if(["unknown","running","quota_blocked"].includes(s?.status)) status="reconcile";
    else if(!depsReady) status="blocked_dependency";
    else if(s?.status==="verified"&&s.inputHash===n.inputHash&&exactDeps&&sha(s.outputHash)&&s.evidenceVerified===true) {
      status="reuse";valid.set(n.id,s.outputHash);
    } else if((s?.attempts??0)>=maxAttempts) status="blocked_attempts";
    else if(slots===0) status="blocked_budget";
    else {status="ready";slots--;}
    results.push({id:n.id,status,dependencyHashes});
  }
  return {nodes:results,complete:results.every(n=>n.status==="reuse"),remainingCallSlots:slots};
}
