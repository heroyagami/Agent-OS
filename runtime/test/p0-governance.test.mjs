import test from "node:test";
import assert from "node:assert/strict";
import { buildTaskContext, dispatchWithContext, createToolGate, assertDelivery } from "../src/p0-governance.mjs";

const task = { taskId: "task-1", agentId: "employee", idempotencyKey: "key-1", prompt: "Do the work.", riskTier: "T1", requiredCapabilities: [], permissionsRequired: { read: ["file:a"], write: ["file:a"], externalActions: [] } };
test("context loads only selected reviewed domains, deduplicates and records hashes", async () => {
  const paths = [];
  const result = await buildTaskContext({ task, domains: ["software", "web"], revision: "reviewed-revision", readTrusted: async (path, revision) => {
    assert.equal(revision, "reviewed-revision"); paths.push(path); return "guidance " + path;
  } });
  assert.deepEqual(paths, ["core/universal-core.md", "core/task-router.md", "skills/software-engineering/SKILL.md", "skills/modern-web-guidance/SKILL.md"]);
  assert.equal(result.manifest.length, 4);
  assert.match(result.manifest[0].sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.task.prompt.endsWith(task.prompt));
  assert.equal(task.prompt, "Do the work.");
});
test("context blocks path injection, missing input and insufficient budget", async () => {
  const options = { task, revision: "r", readTrusted: async () => "content" };
  await assert.rejects(buildTaskContext({ ...options, domains: ["../../private"] }), /Unknown context domain/);
  await assert.rejects(buildTaskContext({ ...options, readTrusted: async () => "" }), /Missing required context/);
  await assert.rejects(buildTaskContext({ ...options, maxBytes: 1 }), /budget exceeded/);
});
test("tool gate denies unknown tools, undeclared scopes and writes without approval", async () => {
  let executions = 0;
  const tools = ["read", "write"].map(group => ({ name: group, group, resolveResource: async args => args.resource, execute: async () => ++executions }));
  const grants = ["read", "write"].map(group => ({ tool: group, group, resource: "file:a" }));
  const invoke = createToolGate({ task, grants, tools, audit: async () => {} });
  await assert.rejects(invoke("shell", {}), /Unregistered/);
  await assert.rejects(invoke("read", { resource: "file:b" }), /not granted/);
  await assert.rejects(invoke("write", { resource: "file:a" }), /authorization/);
  assert.equal(executions, 0);
  assert.equal(await invoke("read", { resource: "file:a" }), 1);
});
test("mutations require trusted authorization and verification, record failed or unknown", async () => {
  const log = [];
  const tools = [{ name: "write", group: "write", resolveResource: async () => "file:a", execute: async () => "output" }];
  const grants = [{ tool: "write", group: "write", resource: "file:a" }];
  const options = { task, tools, grants, audit: async e => log.push(e.phase), authorize: async () => true };
  const blocked = createToolGate({ ...options, validateResult: async () => false });
  await assert.rejects(blocked("write", {}), /did not pass/);
  assert.deepEqual(log, ["before", "failed_or_unknown"]);
  const allowed = createToolGate({ ...options, validateResult: async (_, result) => result === "output" });
  assert.equal(await allowed("write", {}), "output");
  assert.deepEqual(log.slice(-2), ["before", "verified"]);
});
test("acceptance cannot be inferred from host completion or missing evidence", () => {
  assert.throws(() => assertDelivery({ requiredChecks: ["test"], evidence: [] }), /not verified/);
  assert.throws(() => assertDelivery({ requiredChecks: ["test"], evidence: [{ id: "test", status: "passed" }] }), /not verified/);
  assert.deepEqual(assertDelivery({ requiredChecks: ["test"], evidence: [{ id: "test", status: "passed", reference: "trusted test report" }] }), { status: "verified", checks: ["test"] });
});

test("enriched task still passes existing dispatch capability and employee gates", async () => {
  let submitted;
  const agent = { id: "employee", lifecycle_status: "approved", runtime_status: "running", runtime_evidence: ["mock"], approval: { status: "approved" }, permissions: { read: ["file:a"], write: ["file:a"], external_actions: [] } };
  const registry = { select: async ({ requiredCapabilities }) => {
    assert.ok(requiredCapabilities.includes("permissionControls"));
    return { adapter: { id: "mock", submit: async value => { submitted = value; return { runId: "run-1" }; } }, health: { capabilities: { idempotency: "supported" } } };
  } };
  const context = { revision: "r", domains: ["software"], readTrusted: async path => path };
  const result = await dispatchWithContext({ task, agent, registry, context });
  assert.equal(result.handle.runId, "run-1");
  assert.match(submitted.prompt, /software-engineering/);
  submitted = null;
  await assert.rejects(dispatchWithContext({ task, agent: { ...agent, runtime_status: "not_deployed" }, registry, context }), /approved and running/);
  assert.equal(submitted, null);
});
