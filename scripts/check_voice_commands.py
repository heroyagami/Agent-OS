#!/usr/bin/env python3
"""Validate voice-command schema and privacy/confirmation guardrails."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "registry/schema/voice-command.schema.json"
COMMANDS = ROOT / "voice/commands"
REQUIRED = {
    "schema_version", "command_id", "source", "language", "transcript_ref",
    "intent", "requested_action", "target", "entities", "confidence", "risk_tier",
    "confirmation_required", "confirmation_status", "permission_check", "auth_context",
    "task_id", "redaction_status", "result_ref", "created_at",
}
BANNED_KEYS = {"raw_audio", "audio_bytes", "audio_blob", "transcript_text",
               "spoken_text", "voiceprint", "biometric_template"}


def load(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return None


def scan_keys(value, label, errors):
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in BANNED_KEYS:
                errors.append(f"{label}: prohibited raw-audio/transcript field {key}")
            scan_keys(child, label, errors)
    elif isinstance(value, list):
        for child in value:
            scan_keys(child, label, errors)


def main():
    errors = []
    schema = load(SCHEMA_PATH, errors)
    if not isinstance(schema, dict):
        print("FAIL\n" + "\n".join(errors or ["voice schema must be an object"]))
        return 1
    props, required = set(schema.get("properties", {})), set(schema.get("required", []))
    if not REQUIRED.issubset(required) or required - props:
        errors.append("voice-command.schema.json: required fields/properties incomplete")
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("voice-command.schema.json: unexpected JSON Schema dialect")
    if schema.get("additionalProperties") is not False:
        errors.append("voice-command.schema.json: additionalProperties must be false")
    auth = schema.get("properties", {}).get("auth_context", {}).get("properties", {})
    if auth.get("voice_biometrics_used", {}).get("const") is not False:
        errors.append("voice-command.schema.json: voice biometrics must never be an authentication factor")

    commands = sorted(COMMANDS.glob("*.json")) if COMMANDS.is_dir() else []
    seen = set()
    high_impact = {"request_publish", "modify_resource"}
    for path in commands:
        item = load(path, errors)
        if not isinstance(item, dict):
            continue
        label = path.relative_to(ROOT).as_posix()
        missing, extra = REQUIRED - set(item), set(item) - props
        if missing:
            errors.append(f"{label}: missing fields {sorted(missing)}")
        if extra:
            errors.append(f"{label}: undeclared fields {sorted(extra)}")
        scan_keys(item, label, errors)
        command_id = item.get("command_id")
        if not isinstance(command_id, str) or not command_id.startswith("vc-"):
            errors.append(f"{label}: invalid command_id")
        elif command_id in seen:
            errors.append(f"{label}: duplicate command_id")
        seen.add(command_id)
        auth_context = item.get("auth_context") if isinstance(item.get("auth_context"), dict) else {}
        if auth_context.get("voice_biometrics_used") is not False:
            errors.append(f"{label}: voice biometrics cannot authenticate")
        target = item.get("target") if isinstance(item.get("target"), dict) else {}
        high_risk = item.get("risk_tier") == "T3" or item.get("intent") in high_impact
        if high_risk and not (
            item.get("confirmation_required") is True
            and item.get("confirmation_status") == "confirmed"
            and auth_context.get("session_authenticated") is True
            and item.get("permission_check") == "passed"
        ):
            errors.append(f"{label}: high-impact command lacks authenticated session, explicit confirmation or permission pass")
        if target.get("disambiguation_required") is True and item.get("confirmation_status") != "confirmed":
            errors.append(f"{label}: ambiguous target requires explicit confirmation")
        confidence = item.get("confidence")
        if isinstance(confidence, (int, float)) and confidence < 0.8 and item.get("confirmation_status") not in {"pending", "rejected"}:
            errors.append(f"{label}: low-confidence command must be clarified before routing")

    if errors:
        print("FAIL\n" + "\n".join(errors))
        return 1
    print(f"PASS: voice command schema and privacy/confirmation gates; {len(commands)} command records checked.")
    print("Scope: schema-structure and guardrail checks, not audio capture, STT accuracy or account authentication.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
