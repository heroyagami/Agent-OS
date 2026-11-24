# 兼容性与核验范围

文档核对日期：2026-11-24。这里的“可复用”指共享方法、Markdown 与基础 Skill 结构，不保证所有 Agent 的发现、加载、工具、权限和执行语义一致。

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
| Modern Web Guidance | [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance) | 外部 CLI 按需 search/retrieve；需检查 Node/npm 与网络条件；在线遥测可用 DISABLE_TELEMETRY=1 关闭；不代表宿主已安装或浏览器已实测 |

这些来源支持适配方案设计，不构成三种宿主安装测试的证据。安装前重新打开官方文档并记录实际版本；不要从本表推导统一的指令优先级、同名处理或全平台云端行为。

## Runtime Adapter 宿主接入矩阵

| 宿主 | 官方接入面 | 适配方式 | 当前验证状态 |
| --- | --- | --- | --- |
| Hermes | [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server) · [Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) | HTTP Runs API、SSE、stop、approval、Idempotency-Key、unknown-run 显式恢复 | mock 测试；真实服务未连接。续接只允许 API Server 自有 session；幂等键按 profile/凭据隔离并保留 24 小时；profile 权限未人工核验前不允许正式派单 |
| Codex | [App Server protocol](https://github.com/openai/codex/tree/main/codex-rs/app-server) | JSON-RPC over stdio；thread/start、thread/resume 设置 sandbox/approvalPolicy，turn/start 提交输入 | mock 测试；真实 CLI/协议版本未验证。默认 read-only，只开放 workspace-write；非原生幂等，需持久账本 |
| Claude Code | [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) · [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) | query() 流式事件、session resume、usage、canUseTool 审批回调 | mock 测试；真实 SDK/CLI 未连接。必须配置 permissionHandler 才允许 Runtime Core 选择；仅 default/plan 权限模式；非原生幂等，需持久账本 |

### Runtime Adapter 验证边界

- Runtime Core 和三个 Adapter 原型已写入仓库；Node.js 测试只使用 mock fetch、mock JSON-RPC transport 和 mock SDK stream。
- Codex 的 sandbox 与 approvalPolicy 在 thread/start 或 thread/resume 配置；turn/start 只提交输入。当前适配不开放 danger-full-access，也不自动授予外部网络/Connector 权限。
- Hermes 的 session_id 不能跨 CLI、TUI、Desktop、ACP 或消息平台复用；status=unknown 时必须先核对 admission_id 与 execution_generation，再显式 resolve。
- Codex/Claude 的本适配没有原生任务幂等键；未接入 durable=true 的持久化幂等账本时 Runtime Core 会阻塞派单。
- Runtime Core 对所有正式任务都要求宿主提供 permissionControls；T3 任务还要求 approval。Hermes 默认 not_configured，必须完成 profile 权限核验；Claude 必须配置 permissionHandler。
- 当前没有真实 API 凭据、宿主进程或用户设备访问；三种宿主全部保持 draft/not_deployed，无默认宿主、无员工绑定、无真实运行证据。

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
