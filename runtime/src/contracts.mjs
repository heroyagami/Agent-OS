export const RUNTIME_CONTRACT_VERSION = "1.0.0";
export const CAPABILITIES = Object.freeze([
  "submit", "status", "events", "cancel", "approval", "resume",
  "idempotency", "permissionControls", "structuredOutput", "usage", "multiAgent",
]);
export const CAPABILITY_STATES = Object.freeze(["supported", "unsupported", "unknown", "not_configured"]);
export const RISK_TIERS = Object.freeze(["T0", "T1", "T2", "T3"]);

export class RuntimeBlockedError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RuntimeBlockedError";
    this.code = "RUNTIME_BLOCKED";
    this.details = details;
  }
}

export function assertTaskEnvelope(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) throw new TypeError("Runtime task must be an object.");
  for (const field of ["taskId", "agentId", "idempotencyKey", "prompt"]) {
    if (typeof task[field] !== "string" || !task[field].trim()) {
      throw new TypeError("Runtime task requires a non-empty " + field + ".");
    }
  }
  if (task.idempotencyKey.length > 255 || !/^[\x21-\x7e]+$/.test(task.idempotencyKey)) {
    throw new TypeError("idempotencyKey must be 1-255 visible ASCII characters.");
  }
  if (!RISK_TIERS.includes(task.riskTier)) throw new TypeError("riskTier must be T0, T1, T2 or T3.");
  if (!Array.isArray(task.requiredCapabilities)) throw new TypeError("requiredCapabilities must be an array.");
  const permissions = task.permissionsRequired || {};
  for (const field of ["read", "write", "externalActions"]) {
    if (!Array.isArray(permissions[field] || [])) throw new TypeError("permissionsRequired." + field + " must be an array.");
  }
  if (task.workingDirectory !== undefined && typeof task.workingDirectory !== "string") {
    throw new TypeError("workingDirectory must be a string when supplied.");
  }
  if (task.executionPolicy !== undefined &&
      (!task.executionPolicy || typeof task.executionPolicy !== "object" || Array.isArray(task.executionPolicy))) {
    throw new TypeError("executionPolicy must be an object when supplied.");
  }
  return task;
}

export function normalizeCapabilities(values = {}) {
  const result = {};
  for (const capability of CAPABILITIES) {
    const state = values[capability] || "unknown";
    result[capability] = CAPABILITY_STATES.includes(state) ? state : "unknown";
  }
  return result;
}

export function createRuntimeEvent({ adapterId, runId, taskId, type, payload = {}, sequence = 0 }) {
  return {
    contractVersion: RUNTIME_CONTRACT_VERSION,
    adapterId,
    runId,
    taskId: taskId || null,
    sequence,
    type,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function normalizeRunStatus(status) {
  const map = {
    started: "queued", queued: "queued", inProgress: "running", running: "running",
    stopping: "cancelling", waiting_for_approval: "waiting_for_approval",
    completed: "completed", interrupted: "cancelled", cancelled: "cancelled",
    failed: "failed", unknown: "unknown",
  };
  return map[status] || "unknown";
}
