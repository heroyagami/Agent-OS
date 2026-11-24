import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, unlink, lstat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { RuntimeBlockedError } from "../contracts.mjs";

const STORE_VERSION = 1;
const RECORD_STATES = new Set(["reserved", "committed", "unknown", "failed"]);
const HANDLE_FIELDS = ["adapterId", "taskId", "runId", "externalRunId", "sessionId", "status"];

function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHandle(handle) {
  if (!handle || typeof handle !== "object" || Array.isArray(handle)) {
    throw new TypeError("A committed idempotency record requires a runtime handle object.");
  }
  const result = {};
  for (const field of HANDLE_FIELDS) {
    if (typeof handle[field] === "string" && handle[field].trim()) result[field] = handle[field];
  }
  if (!result.runId && !result.externalRunId) {
    throw new TypeError("A runtime handle must include runId or externalRunId.");
  }
  return result;
}

function publicRecord(record) {
  return {
    taskId: record.taskId,
    agentId: record.agentId,
    requestHash: record.requestHash,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    attempts: record.attempts,
    handle: record.handle ? { ...record.handle } : null,
    resolution: record.resolution ? { ...record.resolution } : null,
  };
}

function validateKey(key) {
  if (typeof key !== "string" || key.length < 1 || key.length > 255 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new TypeError("Idempotency key must be 1-255 visible ASCII characters.");
  }
}

export class FileIdempotencyStore {
  constructor({ filePath, lockTimeoutMs = 1500, retryIntervalMs = 25, clock = () => new Date().toISOString() } = {}) {
    if (typeof filePath !== "string" || !isAbsolute(filePath)) {
      throw new TypeError("FileIdempotencyStore requires an absolute filePath; configure it outside the public repository.");
    }
    if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 0 ||
        !Number.isFinite(retryIntervalMs) || retryIntervalMs < 1) {
      throw new TypeError("Lock timeout must be non-negative and retry interval must be positive.");
    }
    if (typeof clock !== "function") throw new TypeError("clock must be a function.");
    this.filePath = resolve(filePath);
    this.lockPath = this.filePath + ".lock";
    this.lockTimeoutMs = lockTimeoutMs;
    this.retryIntervalMs = retryIntervalMs;
    this.clock = clock;
    this.durable = true;
    this.backend = "local-file";
  }

  async acquireLock() {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      let lockHandle = null;
      try {
        lockHandle = await open(this.lockPath, "wx", 0o600);
        await lockHandle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: this.clock() }), { encoding: "utf8" });
        await lockHandle.sync();
        let released = false;
        return async () => {
          if (released) return;
          released = true;
          await lockHandle.close().catch(() => {});
          await unlink(this.lockPath).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
        };
      } catch (error) {
        if (lockHandle) {
          await lockHandle.close().catch(() => {});
          await unlink(this.lockPath).catch(() => {});
        }
        if (error.code !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new RuntimeBlockedError("The durable idempotency ledger is locked. Do not bypass the lock or retry the host task.", {
            lockPath: this.lockPath,
            recovery: "Check the recorded process and confirm it has stopped before manually removing a stale lock.",
          });
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, this.retryIntervalMs));
      }
    }
  }

  async readState() {
    let raw;
    try {
      const info = await lstat(this.filePath);
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new RuntimeBlockedError("The idempotency ledger path must be a regular file, not a symlink or directory.");
      }
      if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
        throw new RuntimeBlockedError("The idempotency ledger file permissions are too broad; restrict it to the owner (0600).");
      }
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return { schemaVersion: STORE_VERSION, records: {} };
      throw error;
    }
    let state;
    try {
      state = JSON.parse(raw);
    } catch {
      throw new RuntimeBlockedError("The idempotency ledger is not valid JSON; execution is blocked until it is repaired.");
    }
    if (!state || state.schemaVersion !== STORE_VERSION || !state.records ||
        typeof state.records !== "object" || Array.isArray(state.records)) {
      throw new RuntimeBlockedError("The idempotency ledger has an unsupported or invalid structure.");
    }
    for (const [keyHash, record] of Object.entries(state.records)) {
      if (!/^[a-f0-9]{64}$/.test(keyHash) || !record || record.keyHash !== keyHash ||
          !RECORD_STATES.has(record.status) || typeof record.taskId !== "string" ||
          typeof record.agentId !== "string" || !/^[a-f0-9]{64}$/.test(record.requestHash || "")) {
        throw new RuntimeBlockedError("The idempotency ledger contains an invalid record; execution is blocked.");
      }
    }
    return state;
  }

  async writeState(state) {
    const temporaryPath = this.filePath + "." + process.pid + "." + randomUUID() + ".tmp";
    let handle = null;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(JSON.stringify(state, null, 2) + "\n", { encoding: "utf8" });
      await handle.sync();
      await handle.close();
      handle = null;
      await rename(temporaryPath, this.filePath);
      try {
        const directory = await open(dirname(this.filePath), "r");
        await directory.sync();
        await directory.close();
      } catch (error) {
        if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM", "EBADF"].includes(error.code)) throw error;
      }
    } finally {
      if (handle) await handle.close().catch(() => {});
      await unlink(temporaryPath).catch(() => {});
    }
  }

  async mutate(callback) {
    const release = await this.acquireLock();
    try {
      const state = await this.readState();
      const outcome = await callback(state);
      if (outcome.changed) await this.writeState(state);
      return outcome.value;
    } finally {
      await release();
    }
  }

  async reserve({ key, taskId, agentId, requestHash } = {}) {
    validateKey(key);
    if (typeof taskId !== "string" || !taskId.trim() || typeof agentId !== "string" || !agentId.trim()) {
      throw new TypeError("reserve requires taskId and agentId.");
    }
    if (typeof requestHash !== "string" || !/^[a-f0-9]{64}$/.test(requestHash)) {
      throw new TypeError("reserve requires a SHA-256 requestHash; raw task content is never stored.");
    }
    const keyHash = digest(key);
    return this.mutate((state) => {
      const current = state.records[keyHash];
      if (current) {
        if (current.taskId !== taskId || current.agentId !== agentId || current.requestHash !== requestHash) {
          return { changed: false, value: { status: "conflict", record: publicRecord(current) } };
        }
        if (current.status === "committed") {
          return { changed: false, value: { status: "replay", handle: { ...current.handle }, record: publicRecord(current) } };
        }
        return { changed: false, value: { status: current.status === "reserved" ? "in_progress" : current.status, record: publicRecord(current) } };
      }
      const now = this.clock();
      const record = {
        keyHash, taskId, agentId, requestHash, status: "reserved",
        createdAt: now, updatedAt: now, attempts: 1, handle: null, resolution: null,
      };
      state.records[keyHash] = record;
      return { changed: true, value: { status: "reserved", record: publicRecord(record) } };
    });
  }

  async commit({ key, handle } = {}) {
    validateKey(key);
    const normalizedHandle = safeHandle(handle);
    const keyHash = digest(key);
    return this.mutate((state) => {
      const record = state.records[keyHash];
      if (!record) throw new RuntimeBlockedError("Cannot commit an idempotency key that was not reserved.");
      if (record.status === "committed") {
        if (JSON.stringify(record.handle) !== JSON.stringify(normalizedHandle)) {
          throw new RuntimeBlockedError("The idempotency key is already committed to a different runtime handle.");
        }
        return { changed: false, value: publicRecord(record) };
      }
      if (record.status !== "reserved") {
        throw new RuntimeBlockedError("Only a reserved idempotency record can be committed; reconcile unknown outcomes explicitly.");
      }
      record.status = "committed";
      record.handle = normalizedHandle;
      record.updatedAt = this.clock();
      return { changed: true, value: publicRecord(record) };
    });
  }

  async markUnknown({ key, reason = "submit_outcome_unknown" } = {}) {
    validateKey(key);
    const keyHash = digest(key);
    return this.mutate((state) => {
      const record = state.records[keyHash];
      if (!record) throw new RuntimeBlockedError("Cannot quarantine an idempotency key that was not reserved.");
      if (record.status === "committed" || record.status === "unknown") {
        return { changed: false, value: publicRecord(record) };
      }
      if (record.status !== "reserved") {
        throw new RuntimeBlockedError("Only a reserved idempotency record can be marked unknown.");
      }
      record.status = "unknown";
      record.updatedAt = this.clock();
      record.resolution = { outcome: "unknown", reason: String(reason).slice(0, 160) };
      return { changed: true, value: publicRecord(record) };
    });
  }

  async resolve({ key, resolution, handle, evidenceRef, actor } = {}) {
    validateKey(key);
    if (!["accepted", "not_submitted"].includes(resolution)) {
      throw new TypeError("resolution must be accepted or not_submitted.");
    }
    if (typeof evidenceRef !== "string" || !evidenceRef.trim() ||
        typeof actor !== "string" || !actor.trim()) {
      throw new TypeError("Resolving an unknown submission requires actor and evidenceRef.");
    }
    const normalizedHandle = resolution === "accepted" ? safeHandle(handle) : null;
    const keyHash = digest(key);
    return this.mutate((state) => {
      const record = state.records[keyHash];
      if (!record) throw new RuntimeBlockedError("Cannot resolve an idempotency key that was not reserved.");
      if (!["reserved", "unknown"].includes(record.status)) {
        throw new RuntimeBlockedError("Only reserved or unknown records can be reconciled.");
      }
      record.status = resolution === "accepted" ? "committed" : "failed";
      record.handle = normalizedHandle;
      record.updatedAt = this.clock();
      record.resolution = {
        outcome: resolution,
        actor: actor.slice(0, 120),
        evidenceRef: evidenceRef.slice(0, 500),
        resolvedAt: record.updatedAt,
      };
      return { changed: true, value: publicRecord(record) };
    });
  }

  async get({ key } = {}) {
    validateKey(key);
    const state = await this.readState();
    const record = state.records[digest(key)];
    return record ? publicRecord(record) : null;
  }

  async listUnresolved() {
    const state = await this.readState();
    return Object.values(state.records)
      .filter((record) => record.status === "reserved" || record.status === "unknown")
      .map(publicRecord);
  }

  async close() {
    // The store opens files only for bounded operations; there is no long-lived connection.
  }
}
