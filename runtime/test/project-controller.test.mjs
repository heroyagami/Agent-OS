import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,writeFile,mkdir,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {openPinnedGitSource,planProjectContext,prepareProjectTask,submitProjectTask,inspectProjectRun,
  RuntimeAdapterRegistry,FileIdempotencyStore} from "../src/index.mjs";

const rev="a".repeat(40),govRev="b".repeat(40);
const catalog={schemaVersion:1,projects:[{id:"studio",repository:"example/studio",kind:"workflow",status:"draft",
  intents:["motion-video"],approvedRevision:null,entrypoints:["README.md","docs/guide.md"]}]};
const source={repository:"example/studio",revision:rev,read:async path=>"Reference "+path};
const project={catalog,intent:"motion-video",source,paths:["README.md"],authorizeRead:async()=>true,
  authorizeRevision:async()=>true,authorizeDocument:async()=>true};
const governance={revision:govRev,domains:["video"],readTrusted:async path=>"Reviewed "+path};
const task={taskId:"job1",agentId:"worker",idempotencyKey:"job-1",prompt:"Make a harmless plan.",riskTier:"T1",
  requiredCapabilities:[],permissionsRequired:{read:[],write:[],externalActions:[]}};
const agent={id:"worker",lifecycle_status:"approved",runtime_status:"running",runtime_evidence:["test-only"],approval:{status:"approved"},permissions:{}};
function host(){
  let count=0;return {id:"test-host",count:()=>count,
    async probe(){return {status:"ready",capabilities:{submit:"supported",status:"supported",permissionControls:"supported",idempotency:"unsupported"}};},
    async submit(t){count++; assert.match(t.prompt,/PROJECT REFERENCE DATA/);return {runId:"r1",status:"running"};},
    async getStatus(){return {runId:"r1",status:"completed",output:"Untrusted host says delivered"};},
    async *streamEvents(){},async cancel(){}};
}
async function ledger(t){const dir=await mkdtemp(join(tmpdir(),"agent-os-project-"));t.after(()=>rm(dir,{recursive:true,force:true}));return new FileIdempotencyStore({filePath:join(dir,"ledger.json")});}

test("real Git object reader ignores dirty worktree and rejects unsafe/untracked paths",async t=>{
  const root=await mkdtemp(join(tmpdir(),"agent-os-git-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync("git",["-C",root,...args],{encoding:"utf8"}).trim();
  git("init","-q");git("config","user.email","fixture@example.invalid");git("config","user.name","Test");
  await writeFile(join(root,"README.md"),"Pinned text\n");await mkdir(join(root,"docs"));await writeFile(join(root,"docs","guide.md"),"Guide\n");
  git("add",".");git("commit","-qm","fixture");const revision=git("rev-parse","HEAD");
  await writeFile(join(root,"README.md"),"Modified worktree");
  const pinned=await openPinnedGitSource({root,revision,repository:"example/studio"});
  assert.equal(await pinned.read("README.md"),"Pinned text\n");
  await assert.rejects(pinned.read("../README.md"));await assert.rejects(pinned.read("missing.md"));
  await assert.rejects(pinned.read("README.md","main"));
  await assert.rejects(pinned.read("docs"));
  const small=await openPinnedGitSource({root,revision,repository:"example/studio",maxFileBytes:4});
  await assert.rejects(small.read("README.md"));
});

test("project plan is bounded, no content returned, read and version authorization fail closed",async()=>{
  const p=await planProjectContext(project);
  assert.equal(p.status,"prepared_reference");assert.equal(p.execution,"not_authorized");
  assert.equal(p.documents[0].path,"README.md");assert.equal(p.documents[0].content,undefined);
  for(const change of [{authorizeRead:async()=>false},{authorizeRevision:async()=>false},
    {authorizeDocument:async()=>false},{paths:["../README.md"]},{paths:["unregistered.md"]},{maxBytes:1},
    {source:{...source,revision:"main"}},{source:{...source,repository:"example/other"}}]) {
    await assert.rejects(planProjectContext({...project,...change}));
  }
});

test("governance and exact host binding enter request fingerprint",async()=>{
  const opts={task,project,governance,adapterId:"test-host",hostBindingId:"profile-one"};
  const a=await prepareProjectTask(opts);
  const b=await prepareProjectTask({...opts,hostBindingId:"profile-two"});
  assert.notEqual(a.manifest.requestHash,b.manifest.requestHash);
  assert.match(a.task.prompt,/Reviewed core\/universal-core/);
  await assert.rejects(prepareProjectTask({...opts,maxBytes:10}));
});

test("dispatch exact request authorization, durable replay, cross-host conflict and independent evidence",async t=>{
  const store=await ledger(t),a=host(),registry=new RuntimeAdapterRegistry([a]);
  const opts={task,project,governance,adapterId:a.id,hostBindingId:"profile-one",agent,registry,
    idempotencyStore:store,authorizeDispatch:async request=>request.requestHash.length===64};
  await assert.rejects(submitProjectTask({...opts,authorizeDispatch:async()=>false}));
  await assert.rejects(submitProjectTask({...opts,agent:{...agent,runtime_status:"not_deployed"}}));
  assert.equal(a.count(),0);
  const receipt=await submitProjectTask(opts);
  assert.equal(receipt.status,"submitted");assert.equal(receipt.delivery,"unverified");
  assert.equal(receipt.runId,"r1");
  await submitProjectTask(opts);assert.equal(a.count(),1);
  await assert.rejects(submitProjectTask({...opts,hostBindingId:"profile-two"}));assert.equal(a.count(),1);
  const inspect={idempotencyStore:store,key:task.idempotencyKey,receipt,registry,authorizeStatus:async()=>true};
  const status=await inspectProjectRun(inspect);
  assert.equal(status.hostStatus,"completed");assert.equal(status.delivery,"unverified");
  await assert.rejects(inspectProjectRun({...inspect,receipt:{...receipt,runId:"forged"}}));
  await assert.rejects(inspectProjectRun({...inspect,authorizeStatus:async()=>false}));
  const verified=await inspectProjectRun({...inspect,requiredChecks:["artifact"],verifyEvidence:async()=>[{id:"artifact",status:"passed",reference:"test fixture"}]});
  assert.equal(verified.delivery,"verified");
});
