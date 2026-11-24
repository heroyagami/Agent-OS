import { assertTaskEnvelope, RuntimeBlockedError } from "./contracts.mjs";

function isSubset(required = [], granted = []) {
  const available = new Set(granted);
  return required.every((permission) => available.has(permission));
}
function assertEmployeeEligible(agent, task) {
  if (!agent || agent.id !== task.agentId) throw new RuntimeBlockedError("Task agentId does not match the supplied employee profile.");
  if (agent.lifecycle_status !== "approved" || agent.runtime_status !== "running") {
    throw new RuntimeBlockedError("Only approved and running employees may receive formal runtime tasks.", {
      agentId: agent.id, lifecycleStatus: agent.lifecycle_status, runtimeStatus: agent.runtime_status,
    });
  }
  if (!Array.isArray(agent.runtime_evidence) || agent.runtime_evidence.length === 0) {
    throw new RuntimeBlockedError("Running employee profile has no runtime evidence.", { agentId: agent.id });
  }
  if (!agent.approval || agent.approval.status !== "approved") {
    throw new RuntimeBlockedError("Employee approval is not recorded.", { agentId: agent.id });
  }
  const required = task.permissionsRequired || {};
  const granted = agent.permissions || {};
  const checks = [
    ["read", required.read || [], granted.read || []],
    ["write", required.write || [], granted.write || []],
    ["externalActions", required.externalActions || [], granted.external_actions || []],
  ];
  const denied = checks.filter(([, wanted, allowed]) => !isSubset(wanted, allowed)).map(([name]) => name);
  if (denied.length) {
    throw new RuntimeBlockedError("Task permissions exceed the employee's approved permission set.", {
      agentId: agent.id, deniedPermissionGroups: denied,
    });
  }
  if (task.riskTier === "T3" && (!task.approval || task.approval.status !== "approved")) {
    throw new RuntimeBlockedError("T3 task requires an explicit task-level approval before dispatch.", { taskId: task.taskId });
  }
}

export async function dispatchTask({
  task, agent, registry, preferredAdapterId = null, idempotencyStore = null,
}) {
  assertTaskEnvelope(task);
  assertEmployeeEligible(agent, task);
  if (!registry || typeof registry.select !== "function") throw new TypeError("A RuntimeAdapterRegistry is required.");
  const requiredCapabilities = new Set(["submit", "status", "permissionControls", ...(task.requiredCapabilities || [])]);
  if (task.riskTier === "T3") requiredCapabilities.add("approval");
  const selected = await registry.select({
    requiredCapabilities: Array.from(requiredCapabilities), preferredAdapterId,
  });
  const { adapter, health } = selected;
  const nativeIdempotency = health.capabilities.idempotency === "supported";
  if (!nativeIdempotency && (!idempotencyStore || idempotencyStore.durable !== true)) {
    throw new RuntimeBlockedError("This host has no native idempotency guarantee; a durable Agent OS idempotency store is required.", {
      adapterId: adapter.id, taskId: task.taskId,
    });
  }
  let reservation = null;
  if (!nativeIdempotency && idempotencyStore) {
    reservation = await idempotencyStore.reserve({
      key: task.idempotencyKey, taskId: task.taskId, agentId: task.agentId,
    });
    if (reservation.status === "replay" && reservation.handle) return reservation.handle;
    if (reservation.status !== "reserved") {
      throw new RuntimeBlockedError("Idempotency reservation was not granted.", {
        adapterId: adapter.id, taskId: task.taskId, reservationStatus: reservation.status,
      });
    }
  }
  try {
    const handle = await adapter.submit(task);
    const result = { ...handle, adapterId: adapter.id, taskId: task.taskId };
    if (reservation && idempotencyStore.commit) {
      await idempotencyStore.commit({ key: task.idempotencyKey, handle: result });
    }
    return result;
  } catch (error) {
    if (reservation && idempotencyStore.fail) {
      await idempotencyStore.fail({ key: task.idempotencyKey, reason: "submit_failed" });
    }
    throw error;
  }
}
