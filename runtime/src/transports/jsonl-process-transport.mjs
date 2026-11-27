import { spawn as nodeSpawn } from "node:child_process";
import { createInterface } from "node:readline";

export class JsonlProcessTransport {
  constructor({ command = "codex", args = ["app-server"], cwd, env, spawnImpl = nodeSpawn, requestTimeoutMs = 60000 } = {}) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.reader = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async connect() {
    if (this.child && !this.child.killed && this.child.exitCode == null && this.child.signalCode == null) return;
    const child = this.spawnImpl(this.command, this.args, {
      cwd: this.cwd, env: this.env, stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    // Drain diagnostics without logging potentially sensitive host output.
    child.stderr?.resume();
    this.reader = createInterface({ input: child.stdout });
    this.reader.on("line", (line) => this.handleLine(line));
    child.on("error", (error) => this.failPending(error));
    child.on("exit", (code, signal) => {
      if (this.child === child) { this.child = null; this.reader?.close(); this.reader = null; }
      this.failPending(new Error("Codex app-server exited (" + code + ", " + signal + ")."));
      this.emit({ transportEvent: "exit", code, signal });
    });
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
  }

  handleLine(line) {
    let message;
    try { message = JSON.parse(line); } catch {
      this.emit({ transportEvent: "invalid_json_line" });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && this.pending.has(message.id) &&
        (Object.prototype.hasOwnProperty.call(message, "result") || Object.prototype.hasOwnProperty.call(message, "error"))) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) {
        const error = new Error(message.error.message || "Codex app-server request failed.");
        error.code = message.error.code;
        error.data = message.error.data;
        pending.reject(error);
      } else pending.resolve(message.result);
      return;
    }
    this.emit(message);
  }

  emit(message) { for (const listener of this.listeners) listener(message); }
  onMessage(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  write(message) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error("Codex app-server transport is not connected.");
    }
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  async request(method, params = {}) {
    await this.connect();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex app-server request timed out: " + method));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ method, id, params }); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async notify(method, params = {}) {
    await this.connect();
    this.write({ method, params });
  }

  async respond(id, result) {
    await this.connect();
    this.write({ id, result });
  }

  failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close() {
    this.failPending(new Error("Host transport closed."));
    if (this.reader) this.reader.close();
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    this.reader = null;
  }
}
