import { RuntimeBlockedError, assertTaskEnvelope } from "./contracts.mjs";
import { dispatchTask } from "./dispatch.mjs";
import { createHash } from "node:crypto";

const deny = (message) => { throw new RuntimeBlockedError(message); };
const bytes = (value) => Buffer.byteLength(value, "utf8");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const CORE = ["core/universal-core.md", "core/task-router.md"];
const SKILLS = Object.freeze({
  legal: ["docs/document-delivery-preferences.md"],
  software: ["skills/software-engineering/SKILL.md"],
  web: ["skills/software-engineering/SKILL.md", "skills/modern-web-guidance/SKILL.md"],
  video: ["skills/video-production/SKILL.md"],
  visual: ["skills/visual-design/SKILL.md"],
  research: ["skills/deep-research/SKILL.md"],
  orchestration: ["skills/task-orchestrator/SKILL.md"],
  architecture: ["skills/agent-architecture/SKILL.md"],
  dispatch: ["skills/agent-dispatcher/SKILL.md"],
  experience: ["skills/experience-curator/SKILL.md"],
  voice: ["skills/voice-command-router/SKILL.md"],
});

// readTrusted is a control-plane reader pinned to a reviewed OS revision.
// Never use a model-supplied filesystem path or read arbitrary project files here.
export async function buildTaskContext({ task, domains = [], readTrusted, revision, maxBytes = 32000 }) {
  assertTaskEnvelope(task);
  if (typeof readTrusted !== "function" || typeof revision !== "string" || !revision.trim()) deny("Trusted context source and revision required.");
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) deny("Invalid context byte budget.");
  if (!Array.isArray(domains) || domains.some(d => typeof d !== "string" || !Object.hasOwn(SKILLS, d))) deny("Unknown context domain.");
  const paths = [...new Set([...CORE, ...domains.flatMap(d => SKILLS[d])])];
  const parts = ["Agent OS reviewed guidance; source revision: " + revision, "Follow host instructions and authorization first."];
  const manifest = [];
  for (const path of paths) {
    const content = await readTrusted(path, revision);
    if (typeof content !== "string" || !content.trim()) deny("Missing required context: " + path);
    parts.push("=== " + path + " ===\n" + content);
    manifest.push({ path, sha256: digest(content), bytes: bytes(content) });
  }
  parts.push("=== USER TASK ===\n" + task.prompt);
  const prompt = parts.join("\n\n");
  if (bytes(prompt) > maxBytes) deny("Context budget exceeded; narrow the selected domains or explicitly raise the budget.");
  return { task: { ...task, prompt }, manifest, bytes: bytes(prompt), revision };
}

// Routes through existing capability, approval and idempotency checks.
// The enriched prompt is part of the existing task fingerprint.
export async function dispatchWithContext({ context, ...args }) {
  const prepared = await buildTaskContext({ ...context, task: args.task });
  const handle = await dispatchTask({ ...args, task: prepared.task });
  return { handle, context: { revision: prepared.revision, manifest: prepared.manifest, bytes: prepared.bytes } };
}

// Only for tools actually mediated by the trusted control plane.
// Resource identifiers MUST be canonicalized by the trusted tool adapter,
// not chosen by an untrusted model. Native host tools still need a sandbox.
export function createToolGate({ task, grants, tools, audit, authorize, validateResult }) {
  assertTaskEnvelope(task);
  if (!Array.isArray(grants) || !Array.isArray(tools) || typeof audit !== "function") deny("Trusted grant, tool registry and audit required.");
  const groups = ["read", "write", "externalActions"];
  const requested = task.permissionsRequired || {};
  const registered = new Map();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== "string" || !groups.includes(tool.group) ||
        typeof tool.resolveResource !== "function" || typeof tool.execute !== "function" || registered.has(tool.name)) deny("Invalid trusted tool registration.");
    registered.set(tool.name, { ...tool });
  }
  const allowed = new Set(grants.map(grant => {
    if (!grant || !groups.includes(grant.group) || typeof grant.resource !== "string" || !grant.resource ||
        typeof grant.tool !== "string" || !registered.has(grant.tool) ||
        registered.get(grant.tool).group !== grant.group) deny("Invalid tool grant.");
    return JSON.stringify([grant.tool, grant.group, grant.resource]);
  }));
  const declared = new Map(groups.map(group => [group, new Set(requested[group] || [])]));
  return async function invoke(name, args) {
    const tool = registered.get(name);
    if (!tool) deny("Unregistered tool.");
    // The trusted resolver must return a scoped, canonical resource and bind execution to it.
    const resource = await tool.resolveResource(args);
    if (typeof resource !== "string" || !declared.get(tool.group).has(resource) ||
        !allowed.has(JSON.stringify([name, tool.group, resource]))) deny("Tool or resource not granted.");
    const action = Object.freeze({ taskId: task.taskId, tool: name, group: tool.group, resource });
    if (tool.group !== "read" && (typeof authorize !== "function" ||
        await authorize(action, args) !== true || typeof validateResult !== "function")) deny("Mutation requires explicit authorization and result verification.");
    await audit({ ...action, phase: "before" });
    try {
      const result = await tool.execute(args, resource);
      if (typeof validateResult === "function" && await validateResult(action, result) !== true) deny("Tool result did not pass verification.");
      await audit({ ...action, phase: "verified" });
      return result;
    } catch (error) {
      await audit({ ...action, phase: "failed_or_unknown" });
      throw error;
    }
  };
}

// Host completion is not delivery. Only independently supplied checks can pass.
export function assertDelivery({ requiredChecks, evidence }) {
  if (!Array.isArray(requiredChecks) || !requiredChecks.length ||
      requiredChecks.some(id => typeof id !== "string" || !id.trim()) ||
      new Set(requiredChecks).size !== requiredChecks.length || !Array.isArray(evidence)) deny("Explicit acceptance checks and evidence required.");
  for (const id of requiredChecks) {
    const matches = evidence.filter(item => item?.id === id);
    if (matches.length !== 1 || matches[0].status !== "passed" ||
        typeof matches[0].reference !== "string" || !matches[0].reference.trim()) deny("Acceptance not verified: " + id);
  }
  return { status: "verified", checks: [...requiredChecks] };
}
