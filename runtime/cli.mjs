#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { openPinnedGitSource } from "./src/git-source.mjs";
import { proposeProjectRoute } from "./src/project-routing.mjs";
import { planProjectContext } from "./src/project-controller.mjs";

const usage="Usage: node runtime/cli.mjs route|plan --config <absolute private config.json> --intent <intent> [--project <id>]";
async function main(args) {
  const [action,...rest]=args;
  if(!["route","plan"].includes(action)||rest.length%2) throw Error(usage);
  const opts={};
  for(let i=0;i<rest.length;i+=2){
    if(!["--config","--intent","--project"].includes(rest[i])||Object.hasOwn(opts,rest[i])||!rest[i+1]) throw Error(usage);
    opts[rest[i]]=rest[i+1];
  }
  if(!isAbsolute(opts["--config"]||"")||!opts["--intent"]) throw Error(usage);
  const raw=await readFile(opts["--config"]);
  if(raw.length>128000) throw Error("Private configuration too large.");
  const cfg=JSON.parse(raw.toString("utf8"));
  if(cfg.schemaVersion!==1||!Array.isArray(cfg.projects)||!cfg.catalog) throw Error("Invalid private configuration.");
  const bindings=new Map();
  for(const b of cfg.projects){
    if(!b||typeof b.id!=="string"||bindings.has(b.id)) throw Error("Invalid project binding.");
    bindings.set(b.id,b);
  }
  const catalogSource=await openPinnedGitSource({...cfg.catalog,maxFileBytes:128000});
  const catalog=JSON.parse(await catalogSource.read("projects/project-registry.json"));
  const routeOptions={catalog,intent:opts["--intent"],preferredId:opts["--project"],authorizeRead:async ({projectId})=>bindings.has(projectId)};
  const route=await proposeProjectRoute(routeOptions);
  if(action==="route"||route.status!=="proposed"){
    console.log(JSON.stringify(route,null,2)); return route.status==="proposed"?0:2;
  }
  const selected=bindings.get(route.candidates[0].id);
  if(selected.reviewed!==true||!Array.isArray(selected.paths)||!selected.paths.length) throw Error("Explicit local review and paths required.");
  const source=await openPinnedGitSource(selected);
  const plan=await planProjectContext({...routeOptions,source,paths:selected.paths,
    authorizeRevision:async ({revision})=>selected.reviewed===true&&revision===selected.revision,
    authorizeDocument:async ({path})=>selected.paths.includes(path)});
  console.log(JSON.stringify(plan,null,2)); return 0;
}
try { process.exitCode=await main(process.argv.slice(2)); }
catch(error) {
  // Avoid emitting arbitrary configuration, paths, model content or provider errors.
  console.error(error?.code==="RUNTIME_BLOCKED"?"Blocked: "+error.message:"Blocked: configuration or input invalid. "+usage);
  process.exitCode=2;
}
