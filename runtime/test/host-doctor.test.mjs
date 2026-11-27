import {test} from "node:test";
import assert from "node:assert/strict";
import {probeHermes,probeClaude,probeCodex} from "../src/host-doctor.mjs";

test("Hermes doctor is read-only, refuses insecure nonlocal HTTP, disables permission proof",async()=>{
  const requests=[];
  const fetchImpl=async(url,opts)=>{
    requests.push([url,opts.method,opts.redirect]);
    const body=url.endsWith("/health")?{status:"ok"}:{features:{run_submission:true,run_status:true,run_events_sse:true,run_stop:true,runs_idempotency:{supported:true,durable:true}}};
    return {ok:true,status:200,json:async()=>body};
  };
  const result=await probeHermes({baseUrl:"http://127.0.0.1:1234",apiKey:"test-only",hostBindingId:"test-profile",fetchImpl});
  assert.equal(result.check,"protocol_verified");
  assert.equal(result.productionAuthorized,false);
  assert.equal(result.capabilities.permissionControls,"not_configured");
  assert.deepEqual(requests.map(x=>x[1]),["GET","GET"]);
  assert.ok(requests.every(x=>x[2]==="error"));
  assert.ok(!JSON.stringify(result).includes("test-only"));
  await assert.rejects(probeHermes({baseUrl:"http://example.com",apiKey:"test",hostBindingId:"profile",fetchImpl}));
});
test("Claude SDK present does not prove authentication or deployment",async()=>{
  const r=await probeClaude({hostBindingId:"profile",query:()=>{throw Error("Never call query");}});
  assert.equal(r.check,"sdk_present");assert.equal(r.authentication,"unknown");assert.equal(r.productionAuthorized,false);
});
test("Codex doctor requires absolute binary and pinned version",async()=>{
  await assert.rejects(probeCodex({command:"codex",expectedVersion:"latest",hostBindingId:"profile"}));
});
