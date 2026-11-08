# 兼容性与核验范围

文档核对日期：2026-11-08。这里的“可复用”指共享方法、Markdown 与基础 Skill 结构，不保证所有 Agent 的发现、加载、工具、权限和执行语义一致。

v0.2.0 默认只复制 [通用提示词](../core/universal-core.md)，不依赖原生 Skill 发现或自动文件加载。下表说明可选文件接入与进阶模式；既有官方依据的核对日期保留，不代表本次做了新的原生运行验证。

## 两种接入能力

| 层面 | 第一版的做法 | 限制 |
| --- | --- | --- |
| 文本复用 | Core、Router、Skills 与 references 通过显式文件读取使用 | Agent 必须能访问源目录并真实读取，链接本身不执行 |
| 原生发现 | 根据所用宿主官方文档安装完整 Skill 目录 | 根 `skills/` 不保证被自动发现；路径/会话/信任/冲突处理随版本变化 |
| 工具执行 | 宿主已有工具在授权内使用 | 仓库不提供图像、剪辑、搜索、部署或子 Agent 运行时 |
| 权限保护 | 规则要求核对授权与范围 | Markdown 不是安全隔离，仍需宿主权限与文件系统保护 |

## 官方依据与选择

| 对象 | 官方来源 | 本项目采用的最小交集 |
| --- | --- | --- |
| Agent Skills 格式 | [Specification](https://agentskills.io/specification) | `SKILL.md` + `name`/`description`；可选 references；不使用平台专属执行字段 |
| Codex 指令 | [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | 项目 AGENTS.md 薄入口，显式读取源文件 |
| Codex Skills | [Build skills](https://learn.chatgpt.com/docs/build-skills) | 按项目/用户位置安装，保留完整目录 |
| Claude Code 指令 | [Memory](https://code.claude.com/docs/en/memory) | 项目 CLAUDE.md，默认只导入 Core；Router 按需打开 |
| Claude Code Skills | [Skills](https://code.claude.com/docs/en/skills) | 按当前版本安装；云端文件可见性单独核实 |
| Hermes 指令 | [Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files) | 合并实际生效的项目上下文；SOUL 仅可选身份补充 |
| Hermes Skills | [Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) | 按当前版本选择原生目录或外部目录，核对信任和写入行为 |

这些来源支持适配方案设计，不构成三种宿主安装测试的证据。安装前重新打开官方文档并记录实际版本；不要从本表推导统一的指令优先级、同名处理或全平台云端行为。

## 验证状态

| 检查 | 当前状态 |
| --- | --- |
| 本仓库路径、链接、Skill 元数据与篇幅、关键入口及首页提示词一致性 | 由 [check_docs.py](../scripts/check_docs.py) 执行，属于静态检查 |
| Markdown 常见格式 | 同上；只是受限子集，不是完整 CommonMark/GFM 解析器 |
| 官方适配文档 | 已查阅上列页面，核对日期见页首 |
| Codex 原生安装与自动发现 | 未做版本化端到端验证 |
| Claude Code 原生安装与自动发现 | 未做版本化端到端验证 |
| Hermes 原生安装与自动发现 | 未做版本化端到端验证 |
| 模型遵从率、质量提升、Token/成本收益 | 未做对照实验，不作效果保证 |

通过 [验收场景](acceptance-scenarios.md) 收集版本化运行证据后，才能将对应宿主从“未验证”改成具体版本/表面/范围下的“已验证”；不能一次试用后声称所有版本兼容。
