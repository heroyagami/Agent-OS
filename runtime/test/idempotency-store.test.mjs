import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIdempotencyStore } from "../src/idempotency/file-store.mjs";
import { fingerprintTask } from "../src/idempotency/identity.mjs";

const task = {
  taskId: "task-ledger-1",
  agentId: "agent-ledger-1",
  idempotencyKey: "private-key-ledger-1",
  prompt: "A private task prompt that must not be stored in the ledger.",
  riskTier: "T1",
  requiredCapabilities: ["events"],
  permissionsRequired: { read: ["workspace"], write: [], externalActions: [] },
};

async function ledgerPath(t) {
  const directory = await mkdtemp(join(tmpdir(), "agent-os-ledger-"));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  return join(directory, "idempotency.json");
}

function reserveArgs(overrides = {}) {
  const value = { ...task, ...overrides };
  return {
    key: value.idempotencyKey,
    taskId: value.taskId,
    agentId: value.agentId,
    requestHash: fingerprintTask(value),
  };
}

const execFileAsync = promisify(execFile);

const handle = {
  adapterId: "codex-app-server",
  taskId: task.taskId,
  runId: "turn-1",
  externalRunId: "turn-1",
  sessionId: "thread-1",
  status: "running",
};

test("file ledger replays a committed handle after process restart without storing prompt or key", async (t) => {
  const filePath = await ledgerPath(t);
  const first = new FileIdempotencyStore({ filePath });
  assert.equal(first.durable, true);
  assert.equal((await first.reserve(reserveArgs())).status, "reserved");
  await first.commit({ key: task.idempotencyKey, handle });
  await first.close();

  const content = await readFile(filePath, "utf8");
  assert.equal(content.includes(task.prompt), false);
  assert.equal(content.includes(task.idempotencyKey), false);

  const restarted = new FileIdempotencyStore({ filePath });
  const replay = await restarted.reserve(reserveArgs());
  assert.equal(replay.status, "replay");
  assert.deepEqual(replay.handle, handle);
  assert.equal((await restarted.get({ key: task.idempotencyKey })).status, "committed");
});

test("file ledger rejects changed payloads and blocks duplicate in-flight reservations", async (t) => {
  const filePath = await ledgerPath(t);
  const store = new FileIdempotencyStore({ filePath });
  const args = reserveArgs();
  assert.equal((await store.reserve(args)).status, "reserved");
  assert.equal((await store.reserve(args)).status, "in_progress");
  assert.equal((await store.reserve({ ...args, requestHash: "a".repeat(64) })).status, "conflict");
});

test("file ledger quarantines unknown submissions until evidence-backed reconciliation", async (t) => {
  const filePath = await ledgerPath(t);
  const store = new FileIdempotencyStore({ filePath });
  await store.reserve(reserveArgs());
  assert.equal((await store.markUnknown({ key: task.idempotencyKey })).status, "unknown");
  assert.equal((await store.reserve(reserveArgs())).status, "unknown");

  await store.resolve({
    key: task.idempotencyKey,
    resolution: "accepted",
    handle,
    evidenceRef: "private-audit:run-lookup-001",
    actor: "runtime-operator",
  });
  const replay = await store.reserve(reserveArgs());
  assert.equal(replay.status, "replay");
  assert.deepEqual(replay.handle, handle);
});

test("file ledger marks verified non-submissions failed and never silently reuses the key", async (t) => {
  const filePath = await ledgerPath(t);
  const store = new FileIdempotencyStore({ filePath });
  await store.reserve(reserveArgs());
  await store.markUnknown({ key: task.idempotencyKey });
  await store.resolve({
    key: task.idempotencyKey,
    resolution: "not_submitted",
    evidenceRef: "private-audit:no-host-run-found",
    actor: "runtime-operator",
  });
  assert.equal((await store.reserve(reserveArgs())).status, "failed");
});

test("file ledger serializes concurrent reservations across store instances", async (t) => {
  const filePath = await ledgerPath(t);
  const stores = Array.from({ length: 5 }, () => new FileIdempotencyStore({
    filePath, lockTimeoutMs: 3000, retryIntervalMs: 5,
  }));
  const results = await Promise.all(stores.map((store) => store.reserve(reserveArgs())));
  assert.equal(results.filter((result) => result.status === "reserved").length, 1);
  assert.equal(results.filter((result) => result.status === "in_progress").length, 4);
});

test("file ledger fails closed on a stale lock and does not remove it automatically", async (t) => {
  const filePath = await ledgerPath(t);
  await writeFile(filePath + ".lock", JSON.stringify({ pid: 999999, acquiredAt: "2026-11-24T00:00:00Z" }), { mode: 0o600 });
  const store = new FileIdempotencyStore({ filePath, lockTimeoutMs: 20, retryIntervalMs: 5 });
  await assert.rejects(store.reserve(reserveArgs()), /ledger is locked/);
  const lock = await readFile(filePath + ".lock", "utf8");
  assert.match(lock, /999999/);
});

test("file ledger fails closed on corrupt state", async (t) => {
  const filePath = await ledgerPath(t);
  await writeFile(filePath, "{broken", { mode: 0o600 });
  const store = new FileIdempotencyStore({ filePath });
  await assert.rejects(store.reserve(reserveArgs()), /not valid JSON/);
});

test("file ledger serializes reservations across separate OS processes", async (t) => {
  const filePath = await ledgerPath(t);
  const storeModule = new URL("../src/idempotency/file-store.mjs", import.meta.url).href;
  const identityModule = new URL("../src/idempotency/identity.mjs", import.meta.url).href;
  const childSource = `
    import { FileIdempotencyStore } from ${JSON.stringify(storeModule)};
    import { fingerprintTask } from ${JSON.stringify(identityModule)};
    const task = ${JSON.stringify(task)};
    const store = new FileIdempotencyStore({
      filePath: ${JSON.stringify(filePath)}, lockTimeoutMs: 5000, retryIntervalMs: 10,
    });
    const result = await store.reserve({
      key: task.idempotencyKey, taskId: task.taskId, agentId: task.agentId,
      requestHash: fingerprintTask(task),
    });
    process.stdout.write(JSON.stringify({ status: result.status }));
  `;
  const children = await Promise.all(Array.from({ length: 4 }, () =>
    execFileAsync(process.execPath, ["--input-type=module", "-e", childSource], { timeout: 15000 })
  ));
  const statuses = children.map((child) => JSON.parse(child.stdout).status);
  assert.equal(statuses.filter((status) => status === "reserved").length, 1);
  assert.equal(statuses.filter((status) => status === "in_progress").length, 3);
});
