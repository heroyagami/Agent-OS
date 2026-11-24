#!/usr/bin/env python3
"""Check experience proposal schema and sanitized proposal records."""
from datetime import datetime
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "registry/schema/experience-proposal.schema.json"
PROPOSALS = ROOT / "experience/proposals"
REQUIRED = {
    "schema_version", "proposal_id", "title", "scope", "status", "owner",
    "source_task_refs", "trigger", "problem", "proposed_change", "steps",
    "acceptance_criteria", "failure_signals", "counterexamples", "evidence",
    "test_cases", "privacy_review", "approval", "merge_target", "rollback",
    "version", "created_at", "updated_at",
}
BANNED_KEYS = {
    "raw_conversation", "client_name", "customer_name", "case_number",
    "api_key", "access_token", "password", "phone_number", "email_address",
}
VERSION = re.compile(r"^\d+\.\d+\.\d+$")


def load(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return None


def scan_keys(value, path, errors):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.lower() in BANNED_KEYS:
                errors.append(f"{path}: prohibited sensitive field name {key}")
            scan_keys(item, path, errors)
    elif isinstance(value, list):
        for item in value:
            scan_keys(item, path, errors)


def main():
    errors = []
    schema = load(SCHEMA_PATH, errors)
    if not isinstance(schema, dict):
        print("FAIL\n" + "\n".join(errors or ["proposal schema must be a JSON object"]))
        return 1
    props = set(schema.get("properties", {}))
    required = set(schema.get("required", []))
    if not REQUIRED.issubset(required) or required - props:
        errors.append("experience-proposal.schema.json: required fields/properties are incomplete")
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("experience-proposal.schema.json: unexpected JSON Schema dialect")
    if schema.get("additionalProperties") is not False:
        errors.append("experience-proposal.schema.json: additionalProperties must be false")

    proposals = sorted(PROPOSALS.glob("*.json")) if PROPOSALS.is_dir() else []
    seen = set()
    for path in proposals:
        item = load(path, errors)
        if not isinstance(item, dict):
            continue
        name = path.relative_to(ROOT).as_posix()
        missing, extra = REQUIRED - set(item), set(item) - props
        if missing:
            errors.append(f"{name}: missing fields {sorted(missing)}")
        if extra:
            errors.append(f"{name}: undeclared fields {sorted(extra)}")
        scan_keys(item, name, errors)
        proposal_id = item.get("proposal_id")
        if not isinstance(proposal_id, str) or not re.fullmatch(r"exp-[a-z0-9][a-z0-9-]*", proposal_id):
            errors.append(f"{name}: invalid proposal_id")
        elif proposal_id in seen:
            errors.append(f"{name}: duplicate proposal_id {proposal_id}")
        seen.add(proposal_id)
        if item.get("scope") not in {"project", "skill", "core"}:
            errors.append(f"{name}: invalid scope")
        status = item.get("status")
        if status not in {"candidate", "redacted", "in_review", "tested", "approved", "rejected", "merged", "deprecated"}:
            errors.append(f"{name}: invalid status")
        privacy = item.get("privacy_review") if isinstance(item.get("privacy_review"), dict) else {}
        approval = item.get("approval") if isinstance(item.get("approval"), dict) else {}
        if status in {"tested", "approved", "merged"}:
            tests = item.get("test_cases", [])
            positive = any(isinstance(x, dict) and x.get("kind") == "positive" and x.get("result") == "pass" for x in tests)
            negative = any(isinstance(x, dict) and x.get("kind") == "negative" and x.get("result") == "pass" for x in tests)
            if not (positive and negative):
                errors.append(f"{name}: tested-or-later status requires passing positive and negative cases")
            if privacy.get("status") != "passed":
                errors.append(f"{name}: tested-or-later status requires privacy review passed")
        if status in {"approved", "merged"} and not (
            approval.get("status") == "approved" and isinstance(approval.get("approver"), str)
            and approval.get("approver").strip() and isinstance(approval.get("approved_at"), str)
            and approval.get("approved_at").strip()
        ):
            errors.append(f"{name}: approved/merged requires named approver and timestamp")
        if item.get("scope") == "core" and len(item.get("evidence", [])) < 2:
            errors.append(f"{name}: Core proposals require cross-project evidence")
        if not VERSION.fullmatch(str(item.get("version", ""))):
            errors.append(f"{name}: invalid version")
        for field in ("created_at", "updated_at"):
            try:
                datetime.fromisoformat(item.get(field, "").replace("Z", "+00:00"))
            except (TypeError, ValueError):
                errors.append(f"{name}: {field} must be ISO date-time")

    if errors:
        print("FAIL\n" + "\n".join(errors))
        return 1
    print(f"PASS: proposal schema contract; {len(proposals)} sanitized proposal records checked.")
    print("Scope: structural/privacy-key checks only; not a full JSON Schema or legal/privacy review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
