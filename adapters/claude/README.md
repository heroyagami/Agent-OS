# Claude Code 接入

依据 2026-11-08 查阅的 [官方 memory 文档](https://code.claude.com/docs/en/memory) 和 [官方 Skills 文档](https://code.claude.com/docs/en/skills)。只使用基础入口与 `name`/`description`，不依赖 Claude 专属 Skill 执行字段。

## 接入步骤

1. 按 [公共说明](../README.md) 准备项目 `.agent-os/`，固定源 commit。
2. 查看实际生效的 `CLAUDE.md` 与已有导入，把 [入口片段](CLAUDE.md) 合并到项目根 `CLAUDE.md`。已有文件必须逐段合并，避免重复导入；不要放在另一个子目录后沿用同一相对路径。
3. 片段的 `@.agent-os/core/...` 只导入 Core 和 Router。其余 Skills/reference 由 Agent 按需打开；不要用 `@` 导入整个库，否则失去渐进式加载的意义。
4. 原生发现可将完整 Skill 目录放到项目 `.claude/skills/` 或个人 `~/.claude/skills/`。保留 references，检查同名冲突，按当前版本确认实际加载。

个人规则可位于 `~/.claude/CLAUDE.md`；全局接入需改为实际共享路径。不同版本对 `AGENTS.md` 直接读取有差异，本适配以 `CLAUDE.md` 为明确入口，不依赖自动读 `AGENTS.md`。

云端/账号同步方式与本地不同，不能假定可访问本机个人 Skills。须针对具体会话类型核对官方文档及文件可见性。

## 验收

在新会话查看当前版本提供的指令/上下文信息，确认两份 Core 文件进入上下文；再测试标题修改与领域路由。只查看导入语法不能证明已加载。记录版本、会话类型、读取证据和结果；第一版未做 Claude Code 原生运行验证。
