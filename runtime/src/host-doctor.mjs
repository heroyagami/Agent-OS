import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { JsonlProcessTransport } from "./transports/jsonl-process-transport.mjs";
import { CodexAppServerAdapter } from "./adapters/codex-app-server.mjs";
import { HermesHttpAdapter } from "./adapters/hermes-http.mjs";

const exec = promisify(execFile);
const pinVersion = v=>typeof v==="string"&&/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(v);
const safeId = v=>typeof v==="string"&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const deny = message=>{throw new Error(message);};
const noSubmit = Object.freeze({modelInvocation:false,productionAuthorized:false,permissionIsolationVerified:false});
function report(host,check,details={}) {
  return {host,check,...details,...noSubmit};
}
async function trustedDirectory(path) {
  if(typeof path!=="string"||!isAbsolute(path))deny("Absolute private directory required.");
  const real=await realpath(path);
  if(!(await stat(real)).isDirectory())deny("Directory required.");
  return real;
}

// Host doctor is deliberately non-inference. No thread/start, turn/start,
// login, token export, arbitrary model prompt or production credentials in logs.
export async function probeCodex({command,cwd,codexHome,expectedVersion,hostBindingId,env=process.env}={}) {
  if(!isAbsolute(command||"")||!pinVersion(expectedVersion)||!safeId(hostBindingId))deny("Explicit Codex binary, version and profile binding required.");
  const workingDirectory=await trustedDirectory(cwd);
  const home=await trustedDirectory(codexHome);
  const executable=await realpath(command);
  if(!(await stat(executable)).isFile())deny("Codex executable required.");
  // Explicit executable, no shell. Only trusted operator's environment is used.
  // Remove API credentials for protocol smoke; existing local CODEX_HOME login
  // may still be present, so account/read is informational and not authorization.
  const childEnv=Object.fromEntries(Object.entries(env).filter(([key])=>
    /^(PATH|Path|PATHEXT|SystemRoot|WINDIR|ComSpec|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|LANG|LC_[A-Z_]+|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/i.test(key)));
  childEnv.CODEX_HOME=home;
  let version;
  try {
    const {stdout}=await exec(executable,["--version"],{cwd:workingDirectory,env:childEnv,timeout:15000,maxBuffer:4096,windowsHide:true});
    const match=/\b(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\s*$/.exec(stdout.trim());
    version=match?.[1];
  } catch { return report("codex-app-server","unavailable",{reason:"version_probe_failed"}); }
  if(version!==expectedVersion) return report("codex-app-server","blocked",{reason:"version_mismatch",expectedVersion,observedVersion:version??null});
  const transport=new JsonlProcessTransport({command:executable,args:["app-server"],cwd:workingDirectory,env:childEnv,requestTimeoutMs:15000});
  try {
    const adapter=new CodexAppServerAdapter({transport,allowLocalPersistence:false});
    const health=await adapter.probe();
    if(health.status!=="ready")return report(adapter.id,"unavailable",{version,reason:"initialize_failed"});
    let authentication="unknown";
    try {
      const account=await transport.request("account/read",{refreshToken:false});
      if(account?.account===null)authentication="not_authenticated";
      else if(account?.account&&typeof account.account.type==="string")authentication="account_present";
    } catch { /* optional account probe; never refresh or print account metadata */ }
    return report(adapter.id,"protocol_verified",{version,hostBindingId,authentication,capabilities:health.capabilities});
  } finally { transport.close(); }
}

// Hermes health/capabilities only. No runs submission. HTTPS or loopback HTTP.
// Caller must own the endpoint and authorize use of its API key.
export async function probeHermes({baseUrl,apiKey,hostBindingId,fetchImpl=globalThis.fetch}={}) {
  if(!safeId(hostBindingId)||typeof apiKey!=="string"||!apiKey.trim())deny("Explicit Hermes host binding and credential required.");
  let url;try{url=new URL(baseUrl);}catch{deny("Invalid Hermes endpoint.");}
  if(url.username||url.password||url.search||url.hash||!(url.protocol==="https:"||(url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))))deny("Hermes requires HTTPS or loopback HTTP.");
  const bounded=(uri,options)=>fetchImpl(uri,{...options,redirect:"error",signal:AbortSignal.timeout(15000)});
  const adapter=new HermesHttpAdapter({baseUrl:url.toString(),apiKey,fetchImpl:bounded,permissionControlsVerified:false});
  const health=await adapter.probe();
  return report("hermes",health.status==="ready"?"protocol_verified":"unavailable",
    {hostBindingId,capabilities:health.capabilities,authentication:health.status==="ready"?"endpoint_responded":"unknown"});
}

// SDK import alone is not a running authenticated Claude instance.
export async function probeClaude({hostBindingId,query}={}) {
  if(!safeId(hostBindingId))deny("Explicit Claude host binding required.");
  return report("claude-agent-sdk",typeof query==="function"?"sdk_present":"not_configured",{hostBindingId,authentication:"unknown"});
}
