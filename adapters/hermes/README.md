# Hermes 接入

依据 2026-11-08 查阅的 [官方 Skills 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) 与 [官方 Context Files 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)。目录、信任机制和配置字段必须按实际 Hermes 版本/实例核对。

日常可直接复制 [首页提示词](../../README.md)，跳过下列文件设置。

## 推荐：项目入口

1. 按 [公共说明](../README.md) 将完整 Agent OS 固定到项目 `.agent-os/`。
2. 检查当前生效的项目上下文文件（如 `.hermes.md`/`HERMES.md`、`AGENTS.md`）。将 [入口片段](AGENTS.md) 合并到实际生效文件，而不是盲新建一个更高优先级文件，导致旧规则未加载。
3. 片段默认只显式读取 Core；明确启用进阶模式后才读取 Router。Markdown 链接不是自动导入，启动后核实当前工作目录、源目录和读取结果。
4. 需要原生发现时，按当前文档选择项目 `.hermes/skills/` 或 `.agents/skills/`；完整复制所需 Skill，保留 references。项目 Skills 可能需要显式信任，先审阅内容再使用当前版本提供的信任流程。

## 可选：共享目录与身份入口

官方文档也列出个人 Skills 和 `skills.external_dirs` 外部目录机制。若选择共享源，将已审阅的实际绝对 `skills/` 路径合并到当前实例配置，不替换整个配置文件；字段、优先级、重复名称处理和写入权限以当前版本为准。

`external_dirs` 不是只读边界，显式 Skill 管理操作可能改写源文件。要防止无审查经验污染，应审查更新流程并按需设置文件权限或隔离副本；提示词本身不能强制只读。

`SOUL.md` 属于当前 `HERMES_HOME` 的全局身份层，不是项目规则目录。本仓库提供 [可选 SOUL 片段](SOUL.md)，只建议手工合并稳定原则，不覆盖原有身份或将整库塞入身份文件。项目试用不需要修改 SOUL。

## 验收

记录 Hermes 版本、实例/配置目录、实际工作目录与信任状态；确认生效项目规范未丢失，Core 被读取，相关 Skill/reference 可定位，并验证共享源未被自主改写。第一版未做 Hermes 原生安装或运行验证。
