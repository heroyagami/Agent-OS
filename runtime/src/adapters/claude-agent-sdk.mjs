import { randomUUID } from "node:crypto";
import { AsyncEventQueue } from "../events.mjs";
import { createRuntimeEvent, normalizeCapabilities } from "../contracts.mjs";

function textFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((item) => item && item.type === "text" && typeof item.text === "string")
    .map((item) => item.text).join("");
}

export class ClaudeAgentSdkAdapter {
  constructor({ query, permissionHandler = null, sessionStore = null } = {}) {
    if (typeof query !== "function") throw new TypeError("Claude adapter requires query from @anthropic-ai/claude-agent-sdk.");
    this.id = "claude-agent-sdk";
    this.query = query;
    this.permissionHandler = permissionHandler;
    this.sessionStore = sessionStore;
    this.runs = new Map();
  }

  async probe() {
    return {
      status: "ready",
      observedAt: new Date().toISOString(),
      capabilities: normalizeCapabilities({
        submit: "supported", status: "supported", events: "supported", cancel: "supported",
        approval: this.permissionHandler ? "supported" : "not_configured",
        resume: this.sessionStore ? "supported" : "not_configured", idempotency: "unsupported",
        permissionControls: this.permissionHandler ? "supported" : "not_configured",
        structuredOutput: "supported", usage: "supported", multiAgent: "unknown",
      }),
      evidence: { sdkEntryPoint: "query()", sdkImported: true },
    };
  }

  async submit(task) {
    const permissionMode = (task.executionPolicy && task.executionPolicy.permissionMode) || "default";
    if (permissionMode !== "default") {
      throw new Error("Claude adapter only permits default permission mode; plan/auto/acceptEdits/bypassPermissions are not enabled.");
    }
    if (task.sessionId && !this.sessionStore) {
      throw new Error("Claude session resume requires an externally managed sessionStore; local transcript persistence is disabled by default.");
    }
    if (task.sessionId && (!task.executionPolicy || task.executionPolicy.claudeSessionOwnershipVerified !== true)) {
      throw new Error("Claude session resume requires a trusted control-plane check of session ownership.");
    }
    const runId = randomUUID();
    const run = {
      runId, taskId: task.taskId, sessionId: task.sessionId || null, status: "starting",
      output: "", usage: null, sequence: 0, queue: new AsyncEventQueue(),
      query: null, cancelRequested: false,
    };
    this.runs.set(runId, run);
    const options = {
      permissionMode,
      permissionPrompts: "host",
      settingSources: [],
      strictMcpConfig: true,
      persistSession: Boolean(this.sessionStore),
      includePartialMessages: true,
      canUseTool: async (toolName, input, details) => {
        if (!this.permissionHandler) {
          return { behavior: "deny", message: "Agent OS approval bridge is not configured." };
        }
        const decision = await this.permissionHandler({ task, toolName, input, details });
        if (!decision || !["allow", "deny"].includes(decision.behavior)) {
          return { behavior: "deny", message: "Approval bridge returned no valid allow/deny decision." };
        }
        return decision;
      },
    };
    if (task.workingDirectory) options.cwd = task.workingDirectory;
    if (this.sessionStore) options.sessionStore = this.sessionStore;
    if (task.sessionId) options.resume = task.sessionId;
    if (task.model) options.model = task.model;
    if (task.budget && typeof task.budget.maxCostUsd === "number") options.maxBudgetUsd = task.budget.maxCostUsd;
    try {
      run.query = this.query({ prompt: task.prompt, options });
      run.status = "running";
      this.push(run, "run.started", { sessionId: task.sessionId || null });
      this.consume(run);
    } catch (error) {
      run.status = "failed";
      this.push(run, "run.failed", { message: error.message });
      run.queue.close();
      throw error;
    }
    return {
      adapterId: this.id, runId, externalRunId: runId,
      sessionId: run.sessionId, status: "running", taskId: task.taskId,
    };
  }

  async consume(run) {
    try {
      for await (const message of run.query) {
        if (message && message.session_id) run.sessionId = message.session_id;
        if (!message || typeof message !== "object") continue;
        if (message.type === "stream_event") {
          const event = message.event || {};
          const delta = event.delta || {};
          if (event.type === "content_block_delta" && delta.type === "text_delta" && typeof delta.text === "string") {
            run.output += delta.text;
            this.push(run, "run.output.delta", { delta: delta.text });
          }
          continue;
        }
        if (message.type === "assistant") {
          const text = textFromContent(message.message && message.message.content);
          if (text) this.push(run, "run.output.message", { text });
          continue;
        }
        if (message.type === "system" && message.subtype === "permission_denied") {
          this.push(run, "run.permission.denied", { toolName: message.tool_name, message: message.message });
          continue;
        }
        if (message.type === "result") {
          run.usage = message.usage || null;
          run.output = typeof message.result === "string" ? message.result : run.output;
          run.status = message.is_error ? "failed" : "completed";
          this.push(run, run.status === "completed" ? "run.completed" : "run.failed", {
            result: message.result || null, subtype: message.subtype || null,
            usage: run.usage, totalCostUsd: message.total_cost_usd || null, sessionId: run.sessionId,
          });
          run.queue.close();
          return;
        }
      }
      if (run.cancelRequested) {
        run.status = "cancelled";
        this.push(run, "run.cancelled", { reason: "cancelled_by_host" });
      } else if (!["completed", "failed", "cancelled"].includes(run.status)) {
        run.status = "failed";
        this.push(run, "run.failed", { message: "Claude Agent SDK stream ended without a result event." });
      }
      run.queue.close();
    } catch (error) {
      run.status = run.cancelRequested ? "cancelled" : "failed";
      this.push(run, run.cancelRequested ? "run.cancelled" : "run.failed", {
        message: run.cancelRequested ? "Cancelled by host." : error.message,
      });
      run.queue.close();
    }
  }

  push(run, type, payload) {
    run.sequence += 1;
    run.queue.push(createRuntimeEvent({
      adapterId: this.id, runId: run.runId, taskId: run.taskId,
      type, payload, sequence: run.sequence,
    }));
  }

  async getStatus(handle) {
    const run = this.runs.get(handle.runId);
    if (!run) return { runId: handle.runId, status: "unknown" };
    return { runId: run.runId, status: run.status, sessionId: run.sessionId, output: run.output, usage: run.usage };
  }

  async *streamEvents(handle) {
    const run = this.runs.get(handle.runId);
    if (!run) throw new Error("Claude runtime run is not present in this process.");
    yield* run.queue;
  }

  async cancel(handle) {
    const run = this.runs.get(handle.runId);
    if (!run || !run.query) throw new Error("Claude runtime query cannot be resolved for cancellation.");
    run.cancelRequested = true;
    if (typeof run.query.close === "function") run.query.close();
    return { status: "cancelling", mode: "close_process" };
  }
}
