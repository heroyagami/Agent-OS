import { CAPABILITIES, RuntimeBlockedError } from "./contracts.mjs";

export class RuntimeAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = new Map();
    for (const adapter of adapters) this.register(adapter);
  }
  register(adapter) {
    if (!adapter || typeof adapter.id !== "string" || !adapter.id.trim()) {
      throw new TypeError("Runtime adapter requires a stable id.");
    }
    for (const method of ["probe", "submit", "getStatus", "streamEvents", "cancel"]) {
      if (typeof adapter[method] !== "function") {
        throw new TypeError("Runtime adapter " + adapter.id + " is missing " + method + "().");
      }
    }
    if (this.adapters.has(adapter.id)) throw new Error("Duplicate runtime adapter id: " + adapter.id);
    this.adapters.set(adapter.id, adapter);
    return adapter;
  }
  get(id) { return this.adapters.get(id) || null; }
  list() { return Array.from(this.adapters.values()); }

  async select({ requiredCapabilities = [], preferredAdapterId = null } = {}) {
    const ordered = this.list().sort((a, b) => {
      if (a.id === preferredAdapterId) return -1;
      if (b.id === preferredAdapterId) return 1;
      return a.id.localeCompare(b.id);
    });
    const failures = [];
    for (const adapter of ordered) {
      if (preferredAdapterId && adapter.id !== preferredAdapterId) continue;
      let health;
      try { health = await adapter.probe(); }
      catch (error) {
        failures.push({ adapterId: adapter.id, reason: "probe_failed", message: error.message });
        continue;
      }
      if (!health || health.status !== "ready") {
        failures.push({ adapterId: adapter.id, reason: "not_ready", status: health && health.status });
        continue;
      }
      const capabilities = health.capabilities || {};
      const missing = requiredCapabilities.filter((name) => capabilities[name] !== "supported");
      if (missing.length) {
        failures.push({ adapterId: adapter.id, reason: "capability_missing", missing });
        continue;
      }
      return { adapter, health };
    }
    throw new RuntimeBlockedError("No ready runtime adapter satisfies the task requirements.", {
      preferredAdapterId, requiredCapabilities, failures,
    });
  }
}

export function assertCapabilityReport(report) {
  if (!report || report.status !== "ready" || !report.capabilities) {
    throw new RuntimeBlockedError("Runtime adapter did not return a ready capability report.");
  }
  for (const capability of CAPABILITIES) {
    if (!["supported", "unsupported", "unknown", "not_configured"].includes(report.capabilities[capability])) {
      throw new TypeError("Invalid capability state for " + capability + ".");
    }
  }
  return report;
}
