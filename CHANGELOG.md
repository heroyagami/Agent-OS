# Changelog

## v0.8.4 — 2026-11-24

- Codex App Server 的 thread/start 会持久化本机 thread；Adapter 默认关闭 submit，只有宿主配置 allowLocalPersistence=true 且单个任务显式 allowLocalTranscriptPersistence=true 才能启动。
- 继续限制 Codex 沙箱为 read-only/workspace-write，不开放 danger-full-access 与外部网络/Connector 权限。
- 新增 RA17，验证本机 transcript 持久化的双重 opt-in，避免未经批准把客户任务写入宿主磁盘。


## v0.8.3 — 2026-11-24

- Claude Agent SDK 的 session resume 暂时标记为 planned，不再接受 sessionId，避免在安全外部 SessionStore 尚未完成前发生本机 transcript 持久化或跨用户续接。
- Claude Adapter 固定 persistSession=false；继续隔离用户/项目设置与未声明的 MCP 连接，并只允许 default 权限模式。
- 文档明确官方 SessionStore 是本地 transcript 的镜像，不是替代品；后续必须先完成临时 CLAUDE_CONFIG_DIR 清理、凭据隔离和外部存储保留策略测试。


## v0.8.2 — 2026-11-24

- Claude Agent SDK 默认关闭本机 session transcript 持久化；只有注入受控外部 sessionStore 才允许恢复会话。
- Claude Runtime 固定使用 default 权限模式、permissionPrompts=host、settingSources=[] 和 strictMcpConfig=true；禁止 plan/auto/acceptEdits/bypassPermissions。
- Runtime Adapter 默认隔离用户/项目设置和未声明 MCP 连接，减少宿主本机配置对权限边界的意外影响。
- 扩展 RA16 会话持久化与隐私回归测试；三种宿主仍未连接真实运行环境。


## v0.8.1 — 2026-11-24

- 收紧 Runtime Core：所有正式任务都必须选择支持 permissionControls 的宿主；T3 任务还必须支持 approval。
- Hermes 默认 permissionControls=not_configured，只有可信控制面完成 API profile 工具策略核验后才能显式启用。
- Claude 只有配置 permissionHandler 才能被正式调度；权限模式限制为 default/plan，禁止 auto、acceptEdits 和 bypassPermissions。
- Codex 继续默认 read-only，仅在岗位授权、任务声明写权限且指定工作目录时使用 workspace-write。
- 补充 RA13–RA15 权限控制回归场景，防止将岗位权限声明误当成宿主安全隔离。


## v0.8.0 — 2026-11-24

- 新增宿主无关的 Runtime Core：统一任务 Envelope、能力状态、运行事件、员工资格、权限子集和幂等闸门。
- 新增 Hermes HTTP/SSE、Codex App Server JSON-RPC/stdio、Claude Agent SDK 三种 Adapter 原型及 JSONL 子进程传输。
- 新增 Runtime Registry、Schema、任务 Envelope Schema、Node.js mock 测试与 Python 注册一致性检查。
- GitHub Actions 增加 Node.js Runtime 测试和 Runtime Registry 检查；继续保持三个宿主 draft/not_deployed、无默认宿主和无员工绑定。
- Codex/Claude 未提供本适配可用的原生任务幂等键，必须先接入持久化幂等账本；当前未部署真实宿主，mock 测试不代表端到端可用。


## v0.7.0 — 2026-11-24

- 新增 voice-command-router Skill、语音指挥工作流、命令 Schema、模板和隐私校验器。
- 定义语音转写、意图/实体识别、目标澄清、风险分级、会话认证、明确确认、权限核对和派单反馈流程。
- 明确声纹或声音相似度不能替代账户认证；高影响动作仍需明确确认与原有审批。
- 将语音入口接入 Task Router、Task Orchestrator、员工治理文档、注册 Schema、验收场景和 GitHub Actions。
- 仅完成可校验的协议与流程；麦克风采集、STT 服务、实时队列及宿主端语音集成仍未部署。


## v0.6.0 — 2026-11-24

- 新增 experience-curator Skill 与 experience-promotion 工作流，将已验收任务转为脱敏、可测试、待审查的候选经验。
- 新增经验提案 JSON Schema、隐私/正反例校验器和经验学习中心说明；禁止把原始对话、客户材料或密钥写入公开仓库。
- 扩展经验提案模板，增加范围选择、正反例、隐私审查、批准记录和回滚字段。
- 将经验学习中心接入 Task Router、Task Orchestrator、员工治理文档、进阶指南和验收场景。
- GitHub Actions 增加经验提案检查；校验通过只代表候选结构合规，不代表提案已获批准或已合入共享 Skill/Core。


## v0.5.0 — 2026-11-24

- 新增 agent-dispatcher Skill 与 agent-dispatch 工作流，明确任务接收、员工匹配、权限/预算闸门、状态流转和阻塞升级。
- 新增 Task JSON Schema 与任务简报模板；任务正文和客户资料必须存入受控私有队列，不进入公开注册仓库。
- 新增 AI 派单员岗位草案，权限仅限读取注册配置；状态为 draft / not_deployed，不代表已接通运行队列。
- 将派单能力接入 Task Router、Task Orchestrator、员工治理文档、注册中心和自动检查。
- 扩展注册校验器，检查任务契约和员工所引用的 Skills；自动检查仍不代表真实宿主派单能力已部署。


## v0.4.0 — 2026-11-24

- 新增 agent-architecture Skill 与 AI 员工团队设计工作流，先盘点复用能力，再决定 Agent、Skill、Workflow 或 Tool。
- 新增 JSON 员工注册中心、Agent/Registry Schema 和首个 AI 架构师岗位卡；其状态明确为 draft / not_deployed，不代表已部署。
- 新增标准库注册校验器，检查 profile 引用、字段、唯一 ID、批准状态和运行证据。
- 将架构师、工作流和注册中心接入 Task Router、Task Orchestrator、员工治理文档与进阶指南。
- 新增 GitHub Actions，在 push、pull request 和手动触发时运行文档与注册检查；宿主运行时、权限隔离及真实员工执行仍需单独部署和验证。


## v0.3.0 — 2026-11-24

- 将用户提供的七条 AI 员工原则整合为横切治理模型：岗位化、AI设计AI、少而精、身份与权限、经验沉淀、自动交接、语音/自然语言入口。
- 新增 AI 员工操作规范，以及岗位、团队设计和结构化交接模板；明确 Agent、Skill、Workflow、Tool 与 Memory 的职责边界。
- 将员工体系接入 Task Router、Task Orchestrator、README、进阶指南和验收场景；保留并兼容 v0.2.4 的 Modern Web Guidance 路由。
- 增加最小权限、人工审批、隐私脱敏、任务日志、成本预算、有限重试、幂等与停止条件。
- 仅完成规则、模板和文档路由整合；不声称已创建运行中的 Agent、语音入口、自动化执行器或宿主权限隔离。跨宿主行为仍须实测。


## v0.2.4 — 2026-11-24

- 新增 Modern Web Guidance 外部专业 Skill，覆盖浏览器 API、CSS、布局、性能、无障碍与兼容性，按需检索而非预加载整套知识库。
- 在 Task Router、软件工程 Skill、首页索引和进阶指南中建立 Web 前端路由；明确纯后端与纯 Remotion 时间线任务不触发。
- 增加实验特性门槛、Baseline/回退检查、浏览器验收和遥测退出说明；未复制上游指南正文，也未声称已完成宿主端到端安装测试。

## v0.2.3 — 2026-11-12

- 核查九条工程规则：保留已有总指挥路由、架构设计、分工、对抗审查、复盘和真实验收，补全按需的多方案竞选与多模型审查触发边界。
- 新增重复错误结构化纠错、成功方法转候选 Skill、基于有证据的历史实践生成个人模式；不自动修改未经审批的共享规则。
- 新增独立的工作模式参考和待执行验收场景。只新增方法，不声称跨宿主原生功能已实现。
- 包含此前未发布的 2026-11-11 文档交付偏好修订。



- 根据用户明确修正扩充成套文档交付偏好：保留甲方原格式、证明图片留边、确认项及时去黄、业绩占位及索引同步、报名资料去重与查询截图范围。
- 明确编辑 DOCX 与采购方规定的最终 DOC、PDF 的阶段区别，按当次约定仅交最少文件、采用公司后缀命名，移出重复格式和不需要的压缩包。
- 补充给交接人及打印店的简短说明、逐袋列明内容，以及不以阅读偏好推断专业能力；新增 D5—D9 待执行行为回归，不声称跨宿主行为已验证。
- 仅记录通用工作偏好，不发布真实项目材料、报价、证件或私人联系方式，不改动 Core。

## v0.2.2 — 2026-11-10

- 根据用户明确授权记录成套文档交付偏好，主动补齐封面、采购方原表、附件、签章位置及整套打印文件。
- 首页与独立 Core 同步加入主动完整交付规则；新增文档偏好入口和领域路由。
- 记录金额与日期一致性、实际排版检查、手盖及电子章版本、相关图片归档和私密资料边界。
- 补充整套交付、报价素材变更、分封反例及手盖隐私的行为回归场景；行为场景仍需实际宿主验证。

## v0.2.1 — 2026-11-08

- 首页改为只发仓库链接时的 Agent 阅读入口，完整规则内嵌，避免重复读取 Core。
- 压缩规则与首页说明，专业资料、原文和模板保留，默认不加载。
- 加入首页与通用提示词篇幅上限，继续核对两处规则一致性。

## v0.2.0 — 2026-11-08

- 以用户提供的原始总纲为基准，默认交付一份可独立复制的通用提示词。
- 首页先展示提示词及简单用法；完整提示词与 Core 文件保持一致。
- 保留分层设计、依赖、风险验证、反证审查、实际验收与停止条件，明确授权和经验更新边界。
- 原首页的架构、安装、流程与维护说明移至可选进阶指南，原始提示词作为基准存档。
- 三套文件入口默认只读 Core；Router、专业 Skills 和模板按需使用，不作为日常使用前置条件。
- 校验新增首页/独立提示词一致性与默认加载范围；未新增三端运行兼容性声明。

## v0.1.0 — 2026-11-08

- 建立 L1 Core / L2 Workflow / L3 Skills / L4 Project 四层职责与渐进式加载协议。
- 加入任务路由、复杂任务编排与拆解/对抗审查/质量闸门参考。
- 加入视觉、视频、软件、研究四个专业 Skills，以及任务/项目/经验模板。
- 提供 Codex、Claude Code、Hermes 薄适配说明与入口片段。
- 提供文档静态检查与实际接入验收场景；原生安装和执行效果仍未验证。

版本号为内容里程碑，不代表已创建 tag、Release 或安装包。
