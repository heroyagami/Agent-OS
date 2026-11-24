import { createRuntimeEvent, normalizeCapabilities, normalizeRunStatus } from "../contracts.mjs";

function terminalEvent(type) {
  return ["run.completed", "run.failed", "run.cancelled", "run.interrupted"].includes(type);
}
function mapHermesEvent(eventName, data, runId, taskId, sequence) {
  const type = (data && (data.type || data.event)) || eventName || "run.progress";
  let normalized = type;
  if (type === "run.cancelled" || type === "run.interrupted") normalized = "run.cancelled";
  else if (type === "approval.request") normalized = "run.approval.required";
  else if (type === "message.delta") normalized = "run.output.delta";
  else if (type.startsWith("message.")) normalized = "run.output";
  else if (type.startsWith("tool.")) normalized = "run.progress";
  return createRuntimeEvent({ adapterId: "hermes", runId, taskId, type: normalized, sequence, payload: data || {} });
}

export class HermesHttpAdapter {
  constructor({ baseUrl, apiKey, permissionControlsVerified = false, fetchImpl = globalThis.fetch } = {}) {
    if (!baseUrl || !apiKey) throw new TypeError("Hermes adapter requires baseUrl and apiKey.");
    if (typeof fetchImpl !== "function") throw new TypeError("Hermes adapter requires fetch().");
    this.id = "hermes";
    this.baseUrl = new URL(baseUrl).toString().replace(/\/$/, "");
    this.apiKey = apiKey;
    this.permissionControlsVerified = permissionControlsVerified === true;
    this.fetchImpl = fetchImpl;
  }

  async request(path, { method = "GET", body, headers = {}, signal } = {}) {
    const response = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: {
        Authorization: "Bearer " + this.apiKey,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = new Error("Hermes API request failed with HTTP " + response.status + ".");
      error.status = response.status;
      error.detail = detail.slice(0, 500);
      throw error;
    }
    if (response.status === 204) return {};
    return response.json();
  }

  async probe() {
    try {
      const [health, capabilities] = await Promise.all([this.request("/health"), this.request("/v1/capabilities")]);
      if (!health || health.status !== "ok") return { status: "unavailable", capabilities: normalizeCapabilities() };
      const features = capabilities.features || {};
      return {
        status: "ready",
        observedAt: new Date().toISOString(),
        capabilities: normalizeCapabilities({
          submit: features.run_submission === true ? "supported" : features.run_submission === false ? "unsupported" : "unknown",
          status: features.run_status === true ? "supported" : features.run_status === false ? "unsupported" : "unknown",
          events: features.run_events_sse === true ? "supported" : features.run_events_sse === false ? "unsupported" : "unknown",
          cancel: features.run_stop === true ? "supported" : features.run_stop === false ? "unsupported" : "unknown",
          approval: features.run_approval === true ? "supported" : features.run_approval === false ? "unsupported" : "unknown",
          idempotency: features.run_submission === true ? "supported" : "unknown",
          resume: features.run_submission === true ? "supported" : "unknown",
          permissionControls: this.permissionControlsVerified ? "supported" : "not_configured", structuredOutput: "unknown", usage: "unknown", multiAgent: "unknown",
        }),
        evidence: { platform: capabilities.platform || "hermes-agent", health: health.status },
      };
    } catch (error) {
      return { status: "unavailable", capabilities: normalizeCapabilities(), errorCode: error.status || "probe_failed" };
    }
  }

  async submit(task) {
    const body = { input: task.prompt };
    if (task.sessionId) {
      if (!task.executionPolicy || task.executionPolicy.hermesApiSessionOwnershipVerified !== true) {
        throw new Error("Hermes session continuation requires a trusted control-plane check that the session is API-server-owned.");
      }
      body.session_id = task.sessionId;
    }
    if (task.instructions) body.instructions = task.instructions;
    const result = await this.request("/v1/runs", {
      method: "POST", headers: { "Idempotency-Key": task.idempotencyKey }, body,
    });
    if (!result.run_id) throw new Error("Hermes did not return run_id.");
    return {
      runId: result.run_id, externalRunId: result.run_id,
      sessionId: result.session_id || task.sessionId || null,
      status: normalizeRunStatus(result.status),
    };
  }

  async getStatus(handle) {
    const result = await this.request("/v1/runs/" + encodeURIComponent(handle.externalRunId || handle.runId));
    return {
      runId: result.run_id, status: normalizeRunStatus(result.status),
      output: result.output, usage: result.usage || null,
      sessionId: result.session_id || null, error: result.error || null,
      admissionId: result.admission_id || null,
      executionGeneration: Number.isInteger(result.execution_generation) ? result.execution_generation : null,
    };
  }

  async cancel(handle) {
    return this.request("/v1/runs/" + encodeURIComponent(handle.externalRunId || handle.runId) + "/stop", {
      method: "POST", body: {},
    });
  }

  async resolveUnknown(handle, resolution) {
    if (!resolution || !resolution.admissionId || !Number.isInteger(resolution.executionGeneration)) {
      throw new TypeError("Unknown-run resolution requires the exact admissionId and executionGeneration from status.");
    }
    return this.request("/v1/runs/" + encodeURIComponent(handle.externalRunId || handle.runId) + "/resolve-unknown", {
      method: "POST",
      body: { admission_id: resolution.admissionId, execution_generation: resolution.executionGeneration },
    });
  }

  async respondToApproval(handle, approval) {
    if (!approval || !approval.requestId || !Number.isInteger(approval.executionGeneration) || !approval.choice) {
      throw new TypeError("Hermes approval requires requestId, executionGeneration and choice.");
    }
    return this.request("/v1/runs/" + encodeURIComponent(handle.externalRunId || handle.runId) + "/approval", {
      method: "POST",
      body: { request_id: approval.requestId, execution_generation: approval.executionGeneration, choice: approval.choice },
    });
  }

  async *streamEvents(handle, { signal } = {}) {
    const runId = handle.externalRunId || handle.runId;
    const response = await this.fetchImpl(this.baseUrl + "/v1/runs/" + encodeURIComponent(runId) + "/events", {
      method: "GET",
      headers: { Authorization: "Bearer " + this.apiKey, Accept: "text/event-stream" },
      signal,
    });
    if (!response.ok || !response.body) throw new Error("Hermes event stream failed with HTTP " + response.status + ".");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sequence = 0;
    const emitBlock = function* (block) {
      let eventName = "";
      const dataLines = [];
      for (const line of block.split(/\r?\n/)) {
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) return;
      const raw = dataLines.join("\n");
      let data;
      try { data = JSON.parse(raw); } catch { data = { text: raw }; }
      sequence += 1;
      yield mapHermesEvent(eventName, data, runId, handle.taskId, sequence);
    };
    try {
      while (true) {
        const part = await reader.read();
        buffer += decoder.decode(part.value || new Uint8Array(), { stream: !part.done });
        let boundary;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
          const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + match[0].length);
          for (const event of emitBlock(block)) {
            yield event;
            if (terminalEvent(event.type)) return;
          }
        }
        if (part.done) break;
      }
      if (buffer.trim()) for (const event of emitBlock(buffer)) yield event;
    } finally {
      reader.releaseLock();
    }
  }
}
