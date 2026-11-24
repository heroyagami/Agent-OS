#!/usr/bin/env python3
"""Validate the host-neutral Runtime Adapter registry using only Python stdlib."""
from datetime import date
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "runtime"
REGISTRY = RUNTIME / "registry.json"
SCHEMA = RUNTIME / "registry.schema.json"
REQUIRED_CAPABILITIES = {
    "submit", "status", "events", "cancel", "approval", "resume",
    "idempotency", "permissions", "usage", "multi_agent",
}
HOSTS = {"hermes", "codex-app-server", "claude-agent-sdk"}
LIFECYCLE = {"draft", "in_review", "approved", "retired"}
RUNTIME_STATUS = {"not_deployed", "configured", "running", "suspended", "unknown"}
CAPABILITY_VALUES = {
    "implemented", "planned", "host_dependent", "local_only", "force_close",
    "callback", "not_configured", "native", "external_ledger_required",
    "host_config_required", "sandbox_policy", "unknown",
}


def load(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return None


def main():
    errors = []
    schema = load(SCHEMA, errors)
    registry = load(REGISTRY, errors)
    if not isinstance(schema, dict) or not isinstance(registry, dict):
        print("FAIL\n" + "\n".join(errors or ["runtime schema and registry must be JSON objects"]))
        return 1

    required = set(schema.get("required", []))
    properties = set(schema.get("properties", {}))
    if not {"schema_version", "contract_version", "updated_at", "default_adapter_id",
            "selection_policy", "adapters", "agent_bindings"}.issubset(required):
        errors.append("runtime.registry.schema.json: incomplete required fields")
    if required - properties:
        errors.append("runtime.registry.schema.json: required fields lack properties")
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("runtime.registry.schema.json: unexpected JSON Schema dialect")
    if schema.get("additionalProperties") is not False:
        errors.append("runtime.registry.schema.json: additionalProperties must be false")

    try:
        date.fromisoformat(registry.get("updated_at", ""))
    except (TypeError, ValueError):
        errors.append("runtime/registry.json: updated_at must be YYYY-MM-DD")
    if registry.get("schema_version") != "1.0.0" or registry.get("contract_version") != "1.0.0":
        errors.append("runtime/registry.json: unsupported schema/contract version")
    if registry.get("default_adapter_id") is not None:
        errors.append("runtime/registry.json: default adapter must remain unset until a host is approved")
    if registry.get("agent_bindings") != []:
        errors.append("runtime/registry.json: agent bindings must remain empty before runtime approval")

    adapters = registry.get("adapters")
    if not isinstance(adapters, list):
        errors.append("runtime/registry.json: adapters must be an array")
        adapters = []
    seen = set()
    for index, adapter in enumerate(adapters):
        label = f"runtime/registry.json adapters[{index}]"
        if not isinstance(adapter, dict):
            errors.append(f"{label}: expected object")
            continue
        adapter_id = adapter.get("id")
        if adapter_id in seen:
            errors.append(f"{label}: duplicate adapter id {adapter_id}")
        seen.add(adapter_id)
        if adapter_id not in HOSTS:
            errors.append(f"{label}: unexpected host adapter id {adapter_id}")
        if adapter.get("lifecycle_status") not in LIFECYCLE:
            errors.append(f"{label}: invalid lifecycle_status")
        if adapter.get("runtime_status") not in RUNTIME_STATUS:
            errors.append(f"{label}: invalid runtime_status")
        if adapter.get("runtime_status") == "running" and (
            adapter.get("lifecycle_status") != "approved" or not adapter.get("runtime_evidence")
        ):
            errors.append(f"{label}: running requires approval and runtime evidence")
        if adapter.get("lifecycle_status") in {"draft", "in_review"} and adapter.get("runtime_status") != "not_deployed":
            errors.append(f"{label}: draft/in_review must remain not_deployed")
        entrypoint = adapter.get("entrypoint", "")
        entry = (RUNTIME / entrypoint).resolve()
        if not entry.is_relative_to(RUNTIME.resolve()) or not entry.is_file():
            errors.append(f"{label}: invalid or missing entrypoint {entrypoint}")
        capabilities = adapter.get("capabilities") if isinstance(adapter.get("capabilities"), dict) else {}
        if set(capabilities) != REQUIRED_CAPABILITIES:
            errors.append(f"{label}: capability keys do not match contract")
        for name, value in capabilities.items():
            if value not in CAPABILITY_VALUES:
                errors.append(f"{label}: invalid capability state {name}={value}")
        docs = adapter.get("official_docs")
        if not isinstance(docs, list) or not docs or not all(
            isinstance(url, str) and url.startswith("https://") for url in docs
        ):
            errors.append(f"{label}: official_docs must contain HTTPS URLs")
        if adapter.get("runtime_status") == "not_deployed" and adapter.get("runtime_evidence") != []:
            errors.append(f"{label}: not_deployed adapter cannot claim runtime evidence")
        for forbidden in ("api_key", "token", "password", "secret", "credential"):
            if forbidden in adapter:
                errors.append(f"{label}: secrets/credentials must not appear in the public registry")

    if seen != HOSTS:
        errors.append("runtime/registry.json: expected exactly Hermes, Codex App Server and Claude Agent SDK adapters")
    if errors:
        print("FAIL\n" + "\n".join(errors))
        return 1
    print(f"PASS: {len(adapters)} host adapters; contract fields, entrypoints, capability declarations and deployment gates.")
    print("Scope: registry consistency only; no live host connection or full JSON Schema validation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
