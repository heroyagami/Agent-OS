import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatchTask, FileIdempotencyStore, RuntimeAdapterRegistry } from "../src/index.mjs";

const task = {
  taskId: "task-dispatch-ledger-1",
  agentId: "agent-dispatch-ledger-1",
  idempotencyKey: "dispatch-ledger-key-1",
  prompt: "Run a harmless isolated task.",
  riskTier: "T1",
  requiredCapabilities: [],
  permissionsRequired: { read: ["workspace"], write: [], externalActions: [] },
};

const agent = {
  id: task.agentId,
  lifecycle_status: "approved",
  runtime_status: "running",
  runtime_evidence: ["isolated-test-runtime"],
  approval: { status: "approved" },
  permissions: { read: ["workspace"], write: [], external_actions: [] },
};

function adapter({ fail = false } = {}) {
  const state = { submissions: 0 };
  return {
    state,
    id: "fake-non-idempotent",
    async probe() {
      return {
        status: "ready",
        capabilities: {
          submit: "supported", status: "supported", events: "supported",
          cancel: "supported", approval: "supported", permissionControls: "supported",
          idempotency: "unsupported",
        },
      };
    },
    async submit() {
      state.submissions += 1;
      if (fail) throw new Error("connection closed after request write");
      return { runId: "run-ledger-1", externalRunId: "run-ledger-1", status: "running" };
    },
    async getStatus() { return { status: "unknown" }; },
    async *streamEvents() {},
    async cancel() {},
  };
}

async function createStore(t) {
  const directory = await mkdtemp(join(tmpdir(), "agent-os-dispatch-ledger-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return new FileIdempotencyStore({ filePath: join(directory, "ledger.json") });
}

test("dispatch replays the original non-idempotent host handle without a second submit", async (t) => {
  const store = await createStore(t);
  const host = adapter();
  const registry = new RuntimeAdapterRegistry([host]);
  const first = await dispatchTask({ task, agent, registry, idempotencyStore: store });
  const second = await dispatchTask({ task, agent, registry, idempotencyStore: store });
  assert.equal(host.state.submissions, 1);
  assert.deepEqual(second, first);
});

test("dispatch quarantines an ambiguous submit failure and refuses automatic retry", async (t) => {
  const store = await createStore(t);
  const host = adapter({ fail: true });
  const registry = new RuntimeAdapterRegistry([host]);
  await assert.rejects(
    dispatchTask({ task, agent, registry, idempotencyStore: store }),
    /submission outcome is unknown/,
  );
  assert.equal((await store.get({ key: task.idempotencyKey })).status, "unknown");
  await assert.rejects(
    dispatchTask({ task, agent, registry, idempotencyStore: store }),
    /reservation was not granted/,
  );
  assert.equal(host.state.submissions, 1);
});
