#!/usr/bin/env python3
"""Read-only checks for Agent OS's deliberately small Markdown/Skill subset.

Uses only Python's standard library. No network, external-link checks, or full
CommonMark parsing. Exit 1 on a finding, 0 otherwise; run from any directory.
"""

from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SKILLS = (
    "task-orchestrator", "visual-design", "video-production",
    "software-engineering", "deep-research",
)
REQUIRED = (
    "README.md", "CHANGELOG.md", "core/universal-core.md", "core/task-router.md",
    *(f"skills/{name}/SKILL.md" for name in SKILLS),
    *(f"skills/task-orchestrator/references/{name}.md" for name in (
        "task-decomposition", "adversarial-review", "quality-gates",
    )),
    *(f"templates/{name}.md" for name in (
        "task-brief", "execution-plan", "review-report", "project-context",
        "experience-proposal",
    )),
    "adapters/README.md", "adapters/codex/README.md", "adapters/codex/AGENTS.md",
    "adapters/claude/README.md", "adapters/claude/CLAUDE.md",
    "adapters/hermes/README.md", "adapters/hermes/AGENTS.md",
    "adapters/hermes/SOUL.md", "docs/compatibility.md",
    "docs/acceptance-scenarios.md", "docs/advanced-guide.md",
    "docs/original-prompt.md", "scripts/check_docs.py",
)


def visible_lines(content):
    """Remove YAML and fenced code, preserving source line numbers."""
    lines = content.splitlines()
    in_yaml = bool(lines and lines[0] == "---")
    fence = None
    for number, line in enumerate(lines, 1):
        if in_yaml:
            if number > 1 and line == "---":
                in_yaml = False
            yield number, ""
            continue
        match = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if match:
            marker, suffix = match.groups()
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence) and not suffix.strip():
                fence = None
            yield number, ""
            continue
        yield number, "" if fence else line


def anchors(content):
    """GitHub-style anchors for the plain headings used in this repository."""
    found, counts = set(), {}
    for _, line in visible_lines(content):
        match = re.match(r"^#{1,6} (.+?)\s*#*$", line)
        if not match:
            continue
        title = match.group(1).lower().replace("`", "")
        slug = re.sub(r"[^\w\- ]", "", title).replace(" ", "-")
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        found.add(f"{slug}-{count}" if count else slug)
    return found


def main():
    findings = []

    def fail(path, message):
        findings.append(f"{path}: {message}")

    for name in REQUIRED:
        if not (ROOT / name).is_file():
            fail(name, "required file missing")

    # Limit checks to project documents, never traverse an embedded .git tree.
    paths = sorted({ROOT / "README.md", ROOT / "CHANGELOG.md"} | {
        path for folder in ("core", "skills", "templates", "adapters", "docs")
        for path in (ROOT / folder).rglob("*.md")
    })
    documents = {}
    for path in paths:
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            fail(path.relative_to(ROOT), f"cannot read UTF-8: {error}")
            continue
        documents[path] = content

    link_count = 0
    for path, content in documents.items():
        name = path.relative_to(ROOT).as_posix()
        lines = content.splitlines()
        visible = list(visible_lines(content))
        if content.startswith("\ufeff"):
            fail(name, "unexpected UTF-8 BOM")
        if "\ufffd" in content:
            fail(name, "Unicode replacement character: possible encoding damage")
        if not content.endswith("\n"):
            fail(name, "missing final newline")
        if any(line.rstrip() != line for line in lines):
            fail(name, "trailing whitespace")
        if any("\t" in line for line in lines):
            fail(name, "tab indentation")
        if any(marker in content for marker in ("<<<<<<< ", ">>>>>>> ")):
            fail(name, "merge conflict marker")
        headings = [(i, len(re.match(r"^#+", line).group()))
                    for i, line in visible if re.match(r"^#{1,6} ", line)]
        if sum(level == 1 for _, level in headings) != 1:
            fail(name, "expected exactly one H1")
        previous = 0
        for number, level in headings:
            if previous and level > previous + 1:
                fail(name, f"line {number}: skipped heading level")
            if number < len(lines) and lines[number].strip():
                fail(name, f"line {number}: missing blank after heading")
            previous = level

        # Check code fence pairing independently of the text/link checks.
        fence = None
        for number, line in enumerate(lines, 1):
            match = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
            if not match:
                continue
            marker, suffix = match.groups()
            if fence is None:
                fence = (marker, number)
                if not suffix.strip():
                    fail(name, f"line {number}: opening fence lacks language")
            elif marker[0] == fence[0][0] and len(marker) >= len(fence[0]) and not suffix.strip():
                fence = None
        if fence:
            fail(name, f"line {fence[1]}: unclosed code fence")

        for number, line in visible:
            # Current documents use inline links without nested parentheses.
            for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", line):
                link_count += 1
                parts = urlsplit(target)
                if parts.scheme or parts.netloc:
                    if parts.scheme != "https":
                        fail(name, f"line {number}: expected HTTPS external link")
                    continue
                resolved = (path.parent / unquote(parts.path)).resolve() if parts.path else path
                if not resolved.is_relative_to(ROOT):
                    fail(name, f"line {number}: link escapes repository: {target}")
                elif not resolved.exists():
                    fail(name, f"line {number}: broken link: {target}")
                elif parts.fragment and resolved in documents:
                    if unquote(parts.fragment) not in anchors(documents[resolved]):
                        fail(name, f"line {number}: missing heading anchor: {target}")
            if re.match(r"^#{1,6}[^ #]", line):
                fail(name, f"line {number}: heading marker lacks space")

    names = set()
    for skill in SKILLS:
        path = ROOT / "skills" / skill / "SKILL.md"
        content = documents.get(path, "")
        match = re.match(r"\A---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n", content)
        if not match:
            fail(path.relative_to(ROOT), "expected simple name/description YAML frontmatter")
            continue
        name, description = match.groups()
        if name != skill or name in names or len(name) > 64:
            fail(path.relative_to(ROOT), "name must be unique and match directory")
        names.add(name)
        if len(description) > 1024 or "用于" not in description:
            fail(path.relative_to(ROOT), "description needs concrete trigger, max 1024 characters")
        if len(content.splitlines()) >= 100:
            fail(path.relative_to(ROOT), "Skill must stay below 100 lines")

    for file, limit in (("core/universal-core.md", 1200), ("core/task-router.md", 3500)):
        if len(documents.get(ROOT / file, "")) > limit:
            fail(file, f"core context budget exceeded: {limit} characters")
    router = documents.get(ROOT / "core/task-router.md", "")
    for skill in SKILLS:
        if f"../skills/{skill}/SKILL.md" not in router:
            fail("core/task-router.md", f"missing route for {skill}")
    for entry in ("adapters/codex/AGENTS.md", "adapters/claude/CLAUDE.md", "adapters/hermes/AGENTS.md"):
        for core in ("universal-core", "task-router"):
            if f".agent-os/core/{core}.md" not in documents.get(ROOT / entry, ""):
                fail(entry, f"missing host-root entry to {core}")
    readme = documents.get(ROOT / "README.md", "")
    for topic in ("给 Agent", "通用规则", "按需补充"):
        if topic not in readme:
            fail("README.md", f"missing simple entry topic: {topic}")
    if len(readme) > 1800:
        fail("README.md", "link-first entry exceeds 1800-character budget")
    prompt = documents.get(ROOT / "core/universal-core.md", "")
    embedded = re.search(
        r"<!-- universal-prompt:start -->\n```text\n(.*?)\n```\n<!-- universal-prompt:end -->",
        readme, re.DOTALL,
    )
    if not embedded or embedded.group(1) != prompt.rstrip("\n"):
        fail("README.md", "copyable prompt must exactly match standalone Core")
    if re.search(r"\[[^\]]*\]\([^)]+\)", prompt):
        fail("core/universal-core.md", "default prompt must not require linked files")
    claude_entry = documents.get(ROOT / "adapters/claude/CLAUDE.md", "")
    imports = re.findall(r"^@(.+)$", claude_entry, re.MULTILINE)
    if imports != [".agent-os/core/universal-core.md"]:
        fail("adapters/claude/CLAUDE.md", "default import must load only standalone Core")
    advanced = documents.get(ROOT / "docs/advanced-guide.md", "")
    for topic in ("四层架构", "目录结构", "渐进式加载", "快速开始", "使用流程", "扩展与维护", "版本路线", "当前限制"):
        if topic not in advanced:
            fail("docs/advanced-guide.md", f"missing preserved topic: {topic}")

    if findings:
        print("FAIL\n" + "\n".join(findings))
        return 1
    print(f"PASS: {len(REQUIRED)} required paths; {len(documents)} Markdown files; "
          f"{link_count} inline links; {len(SKILLS)} Skill headers; context budgets and adapter entries.")
    print("Scope: static subset only; external URLs and native Agent behavior are not validated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
