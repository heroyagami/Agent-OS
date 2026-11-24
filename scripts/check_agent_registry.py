#!/usr/bin/env python3
"""Validate Agent OS registry consistency with the Python standard library."""
from datetime import date
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_DIR = ROOT / "registry"
REQUIRED = {
    "schema_version", "id", "name", "role_type", "lifecycle_status", "runtime_status",
    "owner", "mission", "triggers", "responsibilities", "out_of_scope", "inputs",
    "outputs", "skills", "tools", "permissions", "data_policy", "approval", "budgets",
    "escalation", "stop_conditions", "evaluation", "runtime_evidence", "version",
    "last_reviewed",
}
ARRAYS = ("triggers", "responsibilities", "out_of_scope", "inputs", "outputs", "skills",
          "escalation", "stop_conditions", "runtime_evidence")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
LIFECYCLE = {"draft", "in_review", "approved", "retired"}
RUNTIME = {"not_deployed", "configured", "running", "suspended", "unknown"}


def load(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"{path.relative_to(ROOT)}: {exc}")
        return None


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def main():
    errors = []
    schema = load(REGISTRY_DIR / "schema/agent.schema.json", errors)
    index_schema = load(REGISTRY_DIR / "schema/registry.schema.json", errors)
    task_schema = load(REGISTRY_DIR / "schema/task.schema.json", errors)
    index = load(REGISTRY_DIR / "registry.json", errors)
    if not all(isinstance(x, dict) for x in (schema, index_schema, task_schema, index)):
        print("FAIL\n" + "\n".join(errors or ["registry files must be JSON objects"]))
        return 1

    props, required = set(schema.get("properties", {})), set(schema.get("required", []))
    if not REQUIRED.issubset(required) or required - props:
        errors.append("agent.schema.json: required fields/properties do not cover the profile contract")
    if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("agent.schema.json: unexpected JSON Schema dialect")
    if not {"registry_version", "updated_at", "agents", "teams"}.issubset(set(index_schema.get("required", []))):
        errors.append("registry.schema.json: incomplete required fields")
    task_required = {"schema_version", "task_id", "goal", "status", "priority", "risk_tier", "requester", "acceptance_criteria", "inputs", "required_capabilities", "assigned_agent_id", "permissions_required", "approval", "budget", "deadline", "idempotency_key", "dependencies", "outputs", "evidence", "blockers", "next_action", "created_at", "updated_at"}
    if not task_required.issubset(set(task_schema.get("required", []))) or task_required - set(task_schema.get("properties", {})):
        errors.append("task.schema.json: missing required task contract fields")
    if task_schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
        errors.append("task.schema.json: unexpected JSON Schema dialect")
    if not VERSION_RE.fullmatch(str(index.get("registry_version", ""))):
        errors.append("registry.json: invalid registry_version")
    try:
        date.fromisoformat(index.get("updated_at", ""))
    except (TypeError, ValueError):
        errors.append("registry.json: updated_at must be YYYY-MM-DD")

    agents = index.get("agents")
    if not isinstance(agents, list):
        errors.append("registry.json: agents must be an array")
        agents = []
    seen = set()
    for n, entry in enumerate(agents):
        label = f"registry.json agents[{n}]"
        if not isinstance(entry, dict):
            errors.append(f"{label}: expected object")
            continue
        agent_id, relative = entry.get("id"), entry.get("profile")
        if not isinstance(agent_id, str) or not ID_RE.fullmatch(agent_id):
            errors.append(f"{label}: invalid id")
            continue
        if agent_id in seen:
            errors.append(f"{label}: duplicate id {agent_id}")
        seen.add(agent_id)
        if not nonempty(relative):
            errors.append(f"{label}: missing profile path")
            continue
        path = (REGISTRY_DIR / relative).resolve()
        if not path.is_relative_to(REGISTRY_DIR.resolve()) or path.suffix != ".json":
            errors.append(f"{label}: unsafe profile path")
            continue
        item = load(path, errors)
        if not isinstance(item, dict):
            continue
        if REQUIRED - set(item):
            errors.append(f"{relative}: missing fields {sorted(REQUIRED - set(item))}")
        if set(item) - props:
            errors.append(f"{relative}: undeclared fields {sorted(set(item) - props)}")
        if item.get("id") != agent_id:
            errors.append(f"{relative}: profile ID differs from index")
        if item.get("role_type") not in {"architect", "dispatcher", "researcher", "writer", "reviewer", "operator", "specialist"}:
            errors.append(f"{relative}: invalid role_type")
        life, run = item.get("lifecycle_status"), item.get("runtime_status")
        if life not in LIFECYCLE or run not in RUNTIME:
            errors.append(f"{relative}: invalid lifecycle/runtime status")
        if entry.get("lifecycle_status") != life or entry.get("runtime_status") != run:
            errors.append(f"{label}: status differs from profile")
        for field in ("name", "owner", "mission"):
            if not nonempty(item.get(field)):
                errors.append(f"{relative}: {field} must be non-empty")
        for field in ARRAYS:
            value = item.get(field)
            if not isinstance(value, list) or not all(nonempty(x) for x in value):
                errors.append(f"{relative}: {field} must be an array of non-empty strings")
        for skill_name in item.get("skills", []):
            if not (ROOT / "skills" / skill_name / "SKILL.md").is_file():
                errors.append(f"{relative}: referenced Skill does not exist: {skill_name}")

        tools = item.get("tools") if isinstance(item.get("tools"), dict) else {}
        if tools.get("policy") not in {"deny_by_default", "explicit_allowlist"}:
            errors.append(f"{relative}: invalid tools.policy")
        if not isinstance(tools.get("allowlist"), list) or not all(nonempty(x) for x in tools.get("allowlist", [])):
            errors.append(f"{relative}: invalid tools.allowlist")
        permissions = item.get("permissions") if isinstance(item.get("permissions"), dict) else {}
        for field in ("read", "write", "external_actions"):
            value = permissions.get(field)
            if not isinstance(value, list) or not all(nonempty(x) for x in value):
                errors.append(f"{relative}: invalid permissions.{field}")
        approval = item.get("approval") if isinstance(item.get("approval"), dict) else {}
        if approval.get("status") not in {"pending", "approved", "rejected", "not_required"}:
            errors.append(f"{relative}: invalid approval.status")
        if approval.get("status") == "approved" and not (
            nonempty(approval.get("approved_by")) and nonempty(approval.get("approved_at"))
        ):
            errors.append(f"{relative}: approved profile requires approver and timestamp")
        budgets = item.get("budgets") if isinstance(item.get("budgets"), dict) else {}
        for field in ("max_cost_usd", "max_tool_calls", "max_retries", "deadline_minutes"):
            value = budgets.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0):
                errors.append(f"{relative}: invalid budgets.{field}")
        if run in {"configured", "running"} and not (
            life == "approved" and approval.get("status") == "approved" and nonempty(approval.get("approved_by"))
        ):
            errors.append(f"{relative}: configured/running requires approved lifecycle and approver")
        if life in {"draft", "in_review"} and run != "not_deployed":
            errors.append(f"{relative}: draft/in_review must remain not_deployed")
        if life == "retired" and run in {"configured", "running"}:
            errors.append(f"{relative}: retired profile cannot run")
        if run == "running" and not item.get("runtime_evidence"):
            errors.append(f"{relative}: running requires runtime_evidence")
        if not VERSION_RE.fullmatch(str(item.get("version", ""))):
            errors.append(f"{relative}: invalid version")
        try:
            date.fromisoformat(item.get("last_reviewed", ""))
        except (TypeError, ValueError):
            errors.append(f"{relative}: last_reviewed must be YYYY-MM-DD")

    teams = index.get("teams")
    if not isinstance(teams, list):
        errors.append("registry.json: teams must be an array")
    else:
        team_ids = [x.get("id") for x in teams if isinstance(x, dict)]
        if len(team_ids) != len(set(team_ids)):
            errors.append("registry.json: duplicate team IDs")
    if errors:
        print("FAIL\n" + "\n".join(errors))
        return 1
    print(f"PASS: {len(agents)} Agent profiles; IDs, profile references, schema fields and lifecycle gates.")
    print("Scope: standard-library consistency checks, not full JSON Schema validation or runtime testing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
