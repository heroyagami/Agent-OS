import {test} from "node:test";
import assert from "node:assert/strict";
import {proposeProjectRoute,planExecution} from "../src/project-routing.mjs";
const catalog={schemaVersion:1,projects:[{id:"a",kind:"workflow",status:"draft",intents:["motion-video"]},{id:"b",kind:"workflow",status:"draft",intents:["motion-video"]}]};
test("route ambiguity, authorization and explicit choice",async()=>{
 const x={catalog,intent:"motion-video",authorizeRead:async()=>true};
 assert.equal((await proposeProjectRoute(x)).status,"choice_required");
 assert.equal((await proposeProjectRoute({...x,preferredId:"a"})).status,"proposed");
 assert.equal((await proposeProjectRoute({...x,authorizeRead:async()=>false})).status,"unavailable");
 assert.equal((await proposeProjectRoute({...x,preferredId:"a"})).execution,"not_authorized");
 await assert.rejects(proposeProjectRoute({...x,intent:"publish-anything"}));
});
const h="a".repeat(64),o="b".repeat(64);
const nodes=[{id:"source",deps:[],inputHash:h},{id:"result",deps:["source"],inputHash:h}];
const good={status:"verified",attempts:1,inputHash:h,outputHash:o,dependencyHashes:{},evidenceVerified:true};
test("resume verified outputs; invalidate descendants; respect budget",()=>{
 const states={source:good,result:{...good,dependencyHashes:{source:o}}};
 assert.equal(planExecution({nodes,states,maxCalls:0}).complete,true);
 const changed=[{...nodes[0],inputHash:"c".repeat(64)},nodes[1]];
 assert.deepEqual(planExecution({nodes:changed,states,maxCalls:1}).nodes.map(n=>n.status),["ready","blocked_dependency"]);
 assert.equal(planExecution({nodes,maxCalls:0}).nodes[0].status,"blocked_budget");
 assert.equal(planExecution({nodes,states:{source:{...good,evidenceVerified:false}},maxCalls:1}).nodes[0].status,"ready");
});
test("unknown, quota and cycles do not trigger replay",()=>{
 for(const status of ["unknown","running","quota_blocked"]) assert.equal(planExecution({nodes,states:{source:{status,attempts:1}},maxCalls:4}).nodes[0].status,"reconcile");
 assert.throws(()=>planExecution({nodes:[{...nodes[0],deps:["result"]},nodes[1]],maxCalls:4}));
 assert.equal(planExecution({nodes,states:{source:{status:"failed",attempts:2}},maxCalls:4}).nodes[0].status,"blocked_attempts");
});
