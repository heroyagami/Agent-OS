import { createHash } from "node:crypto";

const IDENTITY_FIELDS = Object.freeze([
  "taskId", "agentId", "prompt", "sessionId", "workingDirectory", "model",
  "instructions", "riskTier", "requiredCapabilities", "permissionsRequired",
  "approval", "budget", "executionPolicy",
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    }
    return result;
  }
  return value;
}

export function fingerprintTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    throw new TypeError("Task fingerprint requires a task object.");
  }
  const identity = {};
  for (const field of IDENTITY_FIELDS) {
    if (task[field] !== undefined) identity[field] = task[field];
  }
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(identity)), "utf8")
    .digest("hex");
}
