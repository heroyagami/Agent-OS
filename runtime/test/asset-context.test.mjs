import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { loadIdentity, buildSkillRegistry, loadSkillRegistry, loadReviewedSkill } from "../src/asset-context.mjs";
const revision="a".repeat(40), archiveHash="b".repeat(64);
const source=(data,allow=true)=>({revision,authorize:async()=>allow,read:async p=>data[p]});
const manifest={agents:{codex:{skills:[{installed_name:"a",archive_skill:"one",content_hash:archiveHash},{installed_name:"bad",status:"error",error:"unavailable"}]}},aliases:{alias:{archive_skill:"one",content_hash:archiveHash}},expectedCount:1,revision};
test("identity is opt-in, scoped and fail closed",async()=>{
  const src=source({"security/data-policy.md":"policy","public/PROFILE.md":"profile","public/preferences/public-collaboration.md":"prefs"});
  assert.equal((await loadIdentity({source:src})).documents.length,0);
  assert.equal((await loadIdentity({source:src,sections:["profile"]})).documents.length,3);
  await assert.rejects(loadIdentity({source:src,sections:["../private"]}));
  await assert.rejects(loadIdentity({source:{...src,authorize:async()=>false},sections:["profile"]}));
  await assert.rejects(loadIdentity({source:src,sections:["profile"],maxBytes:3}));
});
test("dedupes by archive ID, records unavailable without copying errors",()=>{
  const r=buildSkillRegistry(manifest);
  assert.equal(r.entries.length,1); assert.equal(r.unavailable,1);
  assert.deepEqual(r.entries[0].aliases,["a","alias"]);
  assert.equal(r.entries[0].status,"unreviewed");
  assert.throws(()=>buildSkillRegistry({...manifest,expectedCount:2}));
  assert.throws(()=>buildSkillRegistry({...manifest,aliases:{bad:{archive_skill:"../x",content_hash:archiveHash}}}));
  assert.throws(()=>buildSkillRegistry({...manifest,aliases:{bad:{archive_skill:"one",content_hash:"c".repeat(64)}}}));
});
test("registry loader only reads manifests; skill requires separate reviewed bytes",async()=>{
  const text="skill instructions",sha256=createHash("sha256").update(text).digest("hex");
  const data={"manifests/agents.json":JSON.stringify(manifest.agents),"manifests/central-aliases.json":JSON.stringify(manifest.aliases),"manifests/summary.json":JSON.stringify({unique_skill_count:1}),"skills/one/SKILL.md":text};
  const src=source(data),registry=await loadSkillRegistry({source:src});
  await assert.rejects(loadReviewedSkill({source:src,registry,id:"one",approval:async()=>false}));
  await assert.rejects(loadReviewedSkill({source:src,registry,id:"../one",approval:async()=>true}));
  const result=await loadReviewedSkill({source:src,registry,id:"one",approval:async a=>a.sha256===sha256});
  assert.equal(result.content,text);
});
