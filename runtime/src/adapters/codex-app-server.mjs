import { AsyncEventQueue } from "../events.mjs";
import { createRuntimeEvent, normalizeCapabilities, normalizeRunStatus } from "../contracts.mjs";
import { JsonlProcessTransport } from "../transports/jsonl-process-transport.mjs";

function statusFromTurn(status) {
  if (status === "completed") return "completed";
  if (status === "interrupted") return "cancelled";
  if (status === "failed") return "failed";
  return "running";
}
function codexThreadPolicy(task) {
  const sandbox = (task.executionPolicy && task.executionPolicy.sandbox) || "read-only";
  if (!["read-only", "workspace-write"].includes(sandbox)) {
    throw new Error("Codex adapter only permits read-only or workspace-write sandbox modes; danger-full-access is not enabled.");
  }
  const writes = (task.permissionsRequired && task.permissionsRequired.write || []).length > 0;
  const externalActions = (task.permissionsRequired && task.permissionsRequired.externalActions || []).length > 0;
  if (writes && sandbox !== "workspace-write") throw new Error("Codex task requests write permission but the approved sandbox is read-only.");
  if (!writes && sandbox === "workspace-write") throw new Error("Codex workspace-write sandbox exceeds the task's declared write permissions.");
  if (writes && !task.workingDirectory) throw new Error("Codex workspace-write requires an explicit workingDirectory.");
  if (externalActions) throw new Error("Codex adapter does not yet map externalActions to connector/network grants; task is blocked.");
  return { approvalPolicy: "on-request", sandbox };
}

export class CodexAppServerAdapter {
  constructor({ transport = new JsonlProcessTransport(), clientVersion = "0.1.0", allowLocalPersistence = false } = {}) {
    this.id = "codex-app-server";
    this.transport = transport;
    this.clientVersion = clientVersion;
    this.allowLocalPersistence = allowLocalPersistence === true;
    this.ready = false;
    this.runs = new Map();
    this.transport.onMessage((message) => this.handleMessage(message));
  }
  async ensureReady() {
    if (this.ready) return;
    await this.transport.connect();
    await this.transport.request("initialize", {
      clientInfo: { name: "agent-os-runtime", title: "Agent OS Runtime", version: this.clientVersion },
    });
    await this.transport.notify("initialized", {});
    this.ready = true;
  }
  async probe() {
    try {
      await this.ensureReady();
      return {
        status: "ready", observedAt: new Date().toISOString(),
        capabilities: normalizeCapabilities({
          submit: this.allowLocalPersistence ? "supported" : "not_configured", status: "supported", events: "supported", cancel: "supported",
          approval: typeof this.transport.respond === "function" ? "supported" : "not_configured",
          resume: "supported", idempotency: "unsupported", permissionControls: "supported",
          structuredOutput: "supported", usage: "unknown", multiAgent: "unknown",
        }),
        evidence: { protocol: "Codex App Server JSON-RPC", initialized: true },
      };
    } catch {
      return { status: "unavailable", capabilities: normalizeCapabilities() };
    }
  }
  async submit(task) {
    if (!this.allowLocalPersistence || !task.executionPolicy || task.executionPolicy.allowLocalTranscriptPersistence !== true) {
      throw new Error("Codex thread/start persists local transcripts; both adapter-level and task-level local-persistence opt-ins are required.");
    }
    await this.ensureReady();
    const policy = codexThreadPolicy(task);
    let threadResult;
    if (task.sessionId) {
      if (!task.executionPolicy || task.executionPolicy.codexSessionOwnershipVerified !== true) {
        throw new Error("Codex session resume requires a trusted control-plane check of session ownership.");
      }
      const params = {
        threadId: task.sessionId, excludeTurns: true,
        approvalPolicy: policy.approvalPolicy, sandbox: policy.sandbox,
      };
      if (task.workingDirectory) params.cwd = task.workingDirectory;
      threadResult = await this.transport.request("thread/resume", params);
    } else {
      const params = {
        serviceName: "agent-os-runtime",
        approvalPolicy: policy.approvalPolicy,
        sandbox: policy.sandbox,
      };
      if (task.workingDirectory) params.cwd = task.workingDirectory;
      if (task.model) params.model = task.model;
      threadResult = await this.transport.request("thread/start", params);
    }
    const threadId = threadResult && threadResult.thread && threadResult.thread.id;
    if (!threadId) throw new Error("Codex app-server did not return a thread id.");
    const run = {
      runId: null, taskId: task.taskId, threadId, turnId: null, status: "starting",
      queue: new AsyncEventQueue(), sequence: 0, pendingApprovals: new Map(),
      pendingMessages: [], output: "",
    };
    this.runs.set(threadId, run);
    const turnResult = await this.transport.request("turn/start", {
      threadId, input: [{ type: "text", text: task.prompt }],
    });
    const turn = turnResult && turnResult.turn;
    if (!turn || !turn.id) throw new Error("Codex app-server did not return a turn id.");
    run.turnId = turn.id;
    run.runId = turn.id;
    if (run.status === "starting") run.status = "running";
    this.push(run, "run.started", { threadId, turnId: turn.id });
    const pending = run.pendingMessages.splice(0);
    for (const message of pending) this.handleMessage(message);
    return {
      adapterId: this.id, runId: turn.id, externalRunId: turn.id,
      sessionId: threadId, status: normalizeRunStatus(turn.status), taskId: task.taskId,
    };
  }
  handleMessage(message) {
    if (!message || !message.method) return;
    const params = message.params || {};
    const threadId = params.threadId || (params.thread && params.thread.id);
    const run = threadId ? this.runs.get(threadId) : null;
    if (!run) return;
    if (!run.turnId) { run.pendingMessages.push(message); return; }
    const eventTurnId = params.turnId || (params.turn && params.turn.id);
    if (eventTurnId && eventTurnId !== run.turnId) return;
    if (Object.prototype.hasOwnProperty.call(message, "id") &&
        (message.method.includes("requestApproval") || message.method === "tool/requestUserInput" ||
         message.method === "mcpServer/elicitation/request")) {
      run.pendingApprovals.set(message.id, message);
      run.status = "waiting_for_approval";
      this.push(run, "run.approval.required", { requestId: message.id, method: message.method, params });
      return;
    }
    if (message.method === "turn/completed") {
      const turn = params.turn || {};
      run.status = statusFromTurn(turn.status);
      this.push(run, run.status === "completed" ? "run.completed" :
        run.status === "cancelled" ? "run.cancelled" : "run.failed", { turn, threadId, usage: turn.usage || null });
      run.queue.close();
      return;
    }
    if (message.method === "item/agentMessage/delta") {
      const delta = params.delta || params.text || "";
      if (typeof delta === "string") run.output += delta;
      this.push(run, "run.output.delta", { delta });
      return;
    }
    if (message.method === "item/started" || message.method === "item/completed" ||
        message.method === "turn/started" || message.method === "turn/diff/updated") {
      this.push(run, "run.progress", { method: message.method, params });
    }
  }
  push(run, type, payload) {
    run.sequence += 1;
    run.queue.push(createRuntimeEvent({
      adapterId: this.id, runId: run.runId || run.turnId || run.threadId,
      taskId: run.taskId, type, payload, sequence: run.sequence,
    }));
  }
  async getStatus(handle) {
    const run = Array.from(this.runs.values()).find((item) =>
      item.runId === handle.runId || item.turnId === handle.externalRunId);
    if (!run) return { runId: handle.runId, status: "unknown" };
    return { runId: run.runId, status: run.status, sessionId: run.threadId, output: run.output };
  }
  async *streamEvents(handle) {
    const run = Array.from(this.runs.values()).find((item) =>
      item.runId === handle.runId || item.threadId === handle.sessionId);
    if (!run) throw new Error("Codex runtime run is not present in this process.");
    yield* run.queue;
  }
  async cancel(handle) {
    const run = Array.from(this.runs.values()).find((item) =>
      item.runId === handle.runId || item.threadId === handle.sessionId);
    if (!run || !run.turnId) throw new Error("Codex runtime turn cannot be resolved for cancellation.");
    const result = await this.transport.request("turn/interrupt", { threadId: run.threadId, turnId: run.turnId });
    run.status = "cancelling";
    return result;
  }
  async respondToApproval(handle, approval) {
    const run = Array.from(this.runs.values()).find((item) =>
      item.runId === handle.runId || item.threadId === handle.sessionId);
    if (!run || !run.pendingApprovals.has(approval.requestId)) {
      throw new Error("Codex approval request is not pending for this run.");
    }
    await this.transport.respond(approval.requestId, approval.response);
    run.pendingApprovals.delete(approval.requestId);
    run.status = "running";
  }
  close() { this.transport.close(); this.ready = false; }
}
