# 薄适配入口

适配层只负责“在哪里发现指令、如何定位源文件、如何确认读取”，不复制一套新的工作方法。阅读 [兼容性与核验范围](../docs/compatibility.md) 后选择：

- [Codex 接入说明](codex/README.md) 与 [AGENTS.md 片段](codex/AGENTS.md)
- [Claude Code 接入说明](claude/README.md) 与 [CLAUDE.md 片段](claude/CLAUDE.md)
- [Hermes 接入说明](hermes/README.md)、[AGENTS.md 片段](hermes/AGENTS.md) 与 [SOUL.md 可选片段](hermes/SOUL.md)

## 推荐：项目内显式读取

1. 在宿主项目根目录准备未占用的 `.agent-os/`，将本仓库完整检出到该目录，记录固定 commit；若该目录已有内容，先读取并判断来源，不能覆盖。
2. 检查宿主已有指令及生效范围，手工合并所选入口片段。片段按“已放入宿主根指令”编写，里面的 `.agent-os/` 不是相对 `adapters/` 目录。
3. 入口让 Agent 启动时实际读取 Core 和 Router；专业文件只在路由命中时打开。Claude 的两条 `@` 导入用于加载 Core/Router，不导入整个 Skill 库。
4. 在新会话执行加载检查：要求列出实际读取的文件与版本，并做一个小任务。仅列出路径不能证明读取成功，要核对其规则应用和实际产物。

## 可选：原生 Skill 发现

将需要的每个完整 Skill 目录（含 `references/`）复制或经验证的目录链接到目标 Agent 当前支持的位置。先检查同名 Skill，禁止盲覆盖；尽量保留单一来源，复制安装需记录源 commit 和差异。根目录 `skills/` 不保证被宿主自动扫描。

原生发现不代替 Core/Router 接入。只有安装专业 Skills 时，它们可以独立使用，但不代表已启用完整 Agent OS。Skill 内部 references 必须随目录保留；根级 templates 为可选记录工具。

共享路径安装须把入口中的 `.agent-os/` 改为可读的实际绝对路径；Windows、WSL、容器与云端路径不能直接互换。云任务需单独提供文件与权限，不能假定读取本机个人目录。

## 更新与撤销

更新前比较源 commit、已安装版本、用户改动和官方文档；审查差异，运行 [文档检查](../scripts/check_docs.py) 与 [接入验收](../docs/acceptance-scenarios.md)，再切换固定版本。不要让自主经验更新直接改写共享源目录；必要时用文件权限限制写入。

撤销只移除本次加入的入口片段和已确认属于本项目的安装副本/链接；先核对路径、差异与未提交内容。恢复到先前 commit，不整体覆盖 AGENTS.md、CLAUDE.md、SOUL.md 或全局配置。
