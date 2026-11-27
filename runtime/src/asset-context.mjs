import { createHash } from "node:crypto";
import { RuntimeBlockedError } from "./contracts.mjs";

const deny = message => { throw new RuntimeBlockedError(message); };
const pin = value => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const digest = content => createHash("sha256").update(content).digest("hex");
const safeName = n => typeof n === "string" && n.length > 0 && n.length <= 255 &&
  !/[\/\\\x00-\x1f\x7f]/.test(n) && n !== "." && n !== "..";
const own = (o,k) => Object.hasOwn(o,k);
const object = o => o !== null && typeof o === "object" && !Array.isArray(o);
const IDENTITY = Object.freeze({
  profile: ["public/PROFILE.md", "public/preferences/public-collaboration.md"],
  context: ["context/bootstrap.md"],
  workflow: ["preferences/ai-workflow.md"],
  communication: ["preferences/communication.md"],
  writing: ["preferences/writing.md"],
  projects: ["projects/current-focus.md"],
  decisions: ["decisions/decision-log.md"],
});
function requireSource(source) {
  if (!source || !pin(source.revision) || typeof source.read !== "function" ||
      typeof source.authorize !== "function") deny("Pinned asset source and trusted authorization required.");
}
async function readAsset(source, path, maxBytes) {
  // Authorization belongs to the trusted caller, not the model. Never log content.
  if (await source.authorize({ path, revision: source.revision }) !== true) deny("Asset read denied.");
  const content = await source.read(path, source.revision);
  if (typeof content !== "string" || !content.trim() || Buffer.byteLength(content, "utf8") > maxBytes)
    deny("Missing or oversized asset.");
  return content;
}
function budget(n) {
  if (!Number.isSafeInteger(n) || n <= 0) deny("Invalid asset byte budget.");
  return n;
}

// Context is returned as reference data, never appended to governance instructions.
// All paths, including the public snapshot, are stored in the private source.
export async function loadIdentity({ source, sections = [], maxBytes = 16000 }) {
  requireSource(source); budget(maxBytes);
  if (!Array.isArray(sections) || sections.some(s => typeof s !== "string" || !own(IDENTITY,s))) deny("Unknown identity section.");
  const paths = sections.length ? [...new Set(["security/data-policy.md", ...sections.flatMap(s=>IDENTITY[s])])] : [];
  const documents = []; let bytes = 0;
  for (const path of paths) {
    const content = await readAsset(source,path,maxBytes-bytes);
    const size = Buffer.byteLength(content,"utf8"); bytes += size;
    documents.push({ path, content, bytes: size, sha256: digest(content) });
  }
  return { revision: source.revision, classification: "private-reference-data", bytes, documents };
}

// Build the index in the authorized host; do not commit the user's private index to Agent OS.
export function buildSkillRegistry({ agents, aliases, expectedCount, revision }) {
  if (!pin(revision) || !object(agents) || !object(aliases) ||
      !Number.isSafeInteger(expectedCount) || expectedCount < 0) deny("Invalid skill manifest.");
  const index = new Map(); let unavailable = 0;
  const add = (label, entry, host) => {
    if (!object(entry) || !safeName(label)) deny("Invalid manifest entry.");
    if (!own(entry,"archive_skill") && typeof entry.status === "string" && typeof entry.error === "string") {
      unavailable++; return;
    }
    if (!safeName(entry.archive_skill) || !hash(entry.content_hash)) deny("Invalid skill archive entry.");
    let row = index.get(entry.archive_skill);
    if (!row) {
      row = { id: entry.archive_skill, archiveHash: entry.content_hash, aliases: new Set(), hosts: new Set() };
      index.set(row.id,row);
    }
    if (row.archiveHash !== entry.content_hash) deny("Conflicting skill archive hash.");
    row.aliases.add(label);
    if (host) row.hosts.add(host);
  };
  for (const [label,entry] of Object.entries(aliases)) add(label,entry,null);
  for (const [host,group] of Object.entries(agents)) {
    if (!safeName(host) || !object(group) || !Array.isArray(group.skills)) deny("Invalid agent manifest.");
    for (const entry of group.skills) add(entry?.installed_name,entry,host);
  }
  if (index.size !== expectedCount) deny("Skill manifest count mismatch.");
  return { revision, unavailable, entries: [...index.values()].map(row=>({
    id:row.id, archiveHash:row.archiveHash, aliases:[...row.aliases].sort(),
    hosts:[...row.hosts].sort(), status:"unreviewed"
  })).sort((a,b)=>a.id.localeCompare(b.id)) };
}
export async function loadSkillRegistry({ source, maxBytes = 2000000 }) {
  requireSource(source); budget(maxBytes);
  let remaining = maxBytes;
  const read = async path => {
    const raw = await readAsset(source,path,remaining);
    remaining -= Buffer.byteLength(raw,"utf8");
    try { return JSON.parse(raw); } catch { deny("Invalid skill manifest JSON."); }
  };
  const agents = await read("manifests/agents.json");
  const aliases = await read("manifests/central-aliases.json");
  const summary = await read("manifests/summary.json");
  return buildSkillRegistry({agents, aliases, expectedCount:summary.unique_skill_count, revision:source.revision});
}

// Exact ID only; review must bind revision and the actual SKILL.md bytes, not just archive hash.
// The reviewed document is still untrusted guidance; never grants tools or triggers installation.
export async function loadReviewedSkill({ source, registry, id, approval, maxBytes=32000 }) {
  requireSource(source); budget(maxBytes);
  if (!safeName(id) || registry?.revision !== source.revision || !Array.isArray(registry.entries) ||
      !registry.entries.some(row=>row.id===id) || typeof approval !== "function") deny("Skill not registered.");
  const path = "skills/"+id+"/SKILL.md";
  const content = await readAsset(source,path,maxBytes);
  const sha256 = digest(content);
  if (await approval({ id, path, revision:source.revision, sha256 }) !== true) deny("Skill not approved for use.");
  return { id, revision:source.revision, sha256, content, classification:"reviewed-reference-data" };
}
