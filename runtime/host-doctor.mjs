#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { probeCodex,probeHermes,probeClaude } from "./src/host-doctor.mjs";
const usage="Usage: node runtime/host-doctor.mjs --config <absolute private JSON>";
try {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=="--config"||!isAbsolute(args[1]))throw Error(usage);
  const raw=await readFile(args[1]);
  if(raw.length>16000)throw Error("Configuration too large.");
  const cfg=JSON.parse(raw.toString("utf8"));
  if(cfg.schemaVersion!==1||!cfg.host)throw Error("Invalid configuration.");
  let result;
  if(cfg.host==="codex-app-server")result=await probeCodex(cfg);
  else if(cfg.host==="hermes"){
    if(typeof cfg.apiKeyEnv!=="string"||!/^[A-Z][A-Z0-9_]{1,80}$/.test(cfg.apiKeyEnv))throw Error("Credential environment variable required.");
    result=await probeHermes({...cfg,apiKey:process.env[cfg.apiKeyEnv]});
  }else if(cfg.host==="claude-agent-sdk"){
    let query;try{({query}=await import("@anthropic-ai/claude-agent-sdk"));}catch{}
    result=await probeClaude({...cfg,query});
  }else throw Error("Unknown host.");
  console.log(JSON.stringify(result,null,2));
  process.exitCode=["protocol_verified","sdk_present"].includes(result.check)?0:2;
}catch{
  console.error("Host doctor blocked: invalid or unavailable private configuration. "+usage);
  process.exitCode=2;
}
