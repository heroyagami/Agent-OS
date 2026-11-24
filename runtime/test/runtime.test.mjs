import test from "node:test";
import assert from "node:assert/strict";
import { HermesHttpAdapter } from "../src/adapters/hermes-http.mjs";
import { CodexAppServerAdapter } from "../src/adapters/codex-app-server.mjs";
import { ClaudeAgentSdkAdapter } from "../src/adapters/claude-agent-sdk.mjs";
import { RuntimeAdapterRegistry } from "../src/registry.mjs";
import { dispatchTask } from "../src/dispatch.mjs";
import { RuntimeBlockedError } from "../src/contracts.mjs";

const task = {
  taskId: "task-test-1", agentId: "test-agent", idempotencyKey: "task-test-1-attempt-1",
  prompt: "Run a harmless isolated test.", riskTier: "T1",
  requiredCapabilities: ["events"],
  permissionsRequired: { read: ["workspace"], write: [], externalActions: [] },
  executionPolicy: { sandbox: "read-only" },
};

test("Hermes API capability probe and idempotent submit", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path === "/health") return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    if (path === "/v1/capabilities") return new Response(JSON.stringify({
      features: { run_submission: true, run_status: true, run_events_sse: true, run_stop: true, run_approval: true },
    }), { status: 200 });
    if (path === "/v1/runs" && options.method === "POST") return new Response(JSON.stringify({ run_id: "run-1", status: "started" }), { status: 202 });
    if (path === "/v1/runs/run-1") return new Response(JSON.stringify({ run_id: "run-1", status: "completed", output: "done" }), { status: 200 });
    throw new Error("Unexpected fake Hermes request: " + path);
  };
  const adapter = new HermesHttpAdapter({ baseUrl: "http://127.0.0.1:8642", apiKey: "test-only", fetchImpl });
  assert.equal((await adapter.probe()).capabilities.events, "supported");
  const handle = await adapter.submit(task);
  const submit = calls.find((call) => call.path === "/v1/runs" && call.options.method === "POST");
  assert.equal(submit.options.headers["Idempotency-Key"], task.idempotencyKey);
  assert.equal((await adapter.getStatus(handle)).status, "completed");
});

test("Hermes SSE normalizes approval and completion", async () => {
  const fetchImpl = async () => new Response(
    'event: approval.request\ndata: {"prompt_id":"approval-1"}\n\n' +
    'event: run.completed\ndata: {"output":"done"}\n\n',
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
  const adapter = new HermesHttpAdapter({ baseUrl: "http://127.0.0.1:8642", apiKey: "test-only", fetchImpl });
  const events = [];
  for await (const event of adapter.streamEvents({ runId: "run-2", taskId: task.taskId })) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ["run.approval.required", "run.completed"]);
});

class FakeCodexTransport {
  constructor() { this.listeners = new Set(); this.requests = []; }
  async connect() {}
  onMessage(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async request(method, params) {
    this.requests.push({ method, params });
    if (method === "initialize") return {};
    if (method === "thread/start") return { thread: { id: "thread-1" } };
    if (method === "turn/start") {
      setTimeout(() => this.emit({
        method: "turn/completed",
        params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
      }), 0);
      return { turn: { id: "turn-1", status: "inProgress" } };
    }
    return {};
  }
  async notify(method, params) { this.requests.push({ method, params }); }
  async respond() {}
  emit(message) { for (const listener of this.listeners) listener(message); }
  close() {}
}

test("Codex App Server uses thread sandbox policy before turn/start", async () => {
  const transport = new FakeCodexTransport();
  const adapter = new CodexAppServerAdapter({ transport });
  const handle = await adapter.submit(task);
  const events = [];
  for await (const event of adapter.streamEvents(handle)) events.push(event);
  assert.ok(transport.requests.some((entry) => entry.method === "thread/start" && entry.params.sandbox === "read-only"));
  assert.ok(transport.requests.some((entry) => entry.method === "turn/start" && !("sandboxPolicy" in entry.params)));
  assert.equal(events.at(-1).type, "run.completed");
});

test("Codex refuses danger-full-access and external actions", async () => {
  const adapter = new CodexAppServerAdapter({ transport: new FakeCodexTransport() });
  await assert.rejects(adapter.submit({ ...task, executionPolicy: { sandbox: "danger-full-access" } }), /danger-full-access is not enabled/);
  await assert.rejects(adapter.submit({
    ...task, permissionsRequired: { read: [], write: [], externalActions: ["network"] },
  }), /does not yet map externalActions/);
});

test("Claude SDK defaults to denying prompted tools without approval bridge", async () => {
  let options;
  const query = (args) => {
    options = args.options;
    return {
      async *[Symbol.asyncIterator]() { yield { type: "result", is_error: false, result: "done" }; },
      close() {},
    };
  };
  const adapter = new ClaudeAgentSdkAdapter({ query });
  const handle = await adapter.submit(task);
  const events = [];
  for await (const event of adapter.streamEvents(handle)) events.push(event);
  assert.equal(options.permissionPrompts, "host");
  assert.equal((await options.canUseTool("Bash", { command: "echo test" }, {})).behavior, "deny");
  assert.equal(events.at(-1).type, "run.completed");
});

test("Claude adapter rejects bypass-style permission modes", async () => {
  let started = false;
  const query = () => {
    started = true;
    return { async *[Symbol.asyncIterator]() { yield { type: "result", is_error: false, result: "done" }; }, close() {} };
  };
  const adapter = new ClaudeAgentSdkAdapter({ query, permissionHandler: async () => ({ behavior: "deny" }) });
  await assert.rejects(
    adapter.submit({ ...task, executionPolicy: { permissionMode: "bypassPermissions" } }),
    /auto\/bypass\/acceptEdits are not enabled/,
  );
  assert.equal(started, false);
});

test("Runtime Core blocks every task when host permission controls are unverified", async () => {
  const agent = {
    id: "test-agent", lifecycle_status: "approved", runtime_status: "running",
    runtime_evidence: ["test"], approval: { status: "approved" },
    permissions: { read: ["workspace"], write: [], external_actions: [] },
  };
  const fake = {
    id: "fake",
    async probe() { return { status: "ready", capabilities: {
      submit: "supported", status: "supported", idempotency: "supported",
      permissionControls: "not_configured",
    } }; },
    async submit() { throw new Error("must not run"); },
    async getStatus() {},
    async *streamEvents() {},
    async cancel() {},
  };
  await assert.rejects(dispatchTask({ task, agent, registry: new RuntimeAdapterRegistry([fake]) }), /No ready runtime adapter/);
});

test("Runtime Core blocks draft employees and non-idempotent hosts without durable ledger", async () => {
  const agent = {
    id: "test-agent", lifecycle_status: "approved", runtime_status: "running",
    runtime_evidence: ["test"], approval: { status: "approved" },
    permissions: { read: ["workspace"], write: [], external_actions: [] },
  };
  const fake = {
    id: "fake",
    async probe() { return { status: "ready", capabilities: { submit: "supported", status: "supported", events: "supported", permissionControls: "supported", idempotency: "unsupported" } }; },
    async submit() { return { runId: "run-fake" }; },
    async getStatus() {},
    async *streamEvents() {},
    async cancel() {},
  };
  const registry = new RuntimeAdapterRegistry([fake]);
  await assert.rejects(dispatchTask({ task, agent: { ...agent, lifecycle_status: "draft" }, registry }), RuntimeBlockedError);
  await assert.rejects(dispatchTask({ task, agent, registry }), /durable Agent OS idempotency store is required/);
});

test("Runtime Core requires approval-capable host for T3", async () => {
  const agent = {
    id: "test-agent", lifecycle_status: "approved", runtime_status: "running",
    runtime_evidence: ["test"], approval: { status: "approved" },
    permissions: { read: ["workspace"], write: [], external_actions: [] },
  };
  const fake = {
    id: "fake",
    async probe() { return { status: "ready", capabilities: {
      submit: "supported", status: "supported", approval: "not_configured",
      permissionControls: "supported", idempotency: "supported",
    } }; },
    async submit() { throw new Error("must not run"); },
    async getStatus() {},
    async *streamEvents() {},
    async cancel() {},
  };
  await assert.rejects(
    dispatchTask({ task: { ...task, riskTier: "T3", approval: { status: "approved" } }, agent, registry: new RuntimeAdapterRegistry([fake]) }),
    /No ready runtime adapter/,
  );
});
