# 可选进阶指南

日常使用请返回 [首页](../README.md)，复制通用提示词即可。下面保留第一版的详细方法，供需要文件接入、专业 Skill 或复杂项目编排时查阅；不要求全部安装、阅读或执行。

一套供智能体复用的任务执行与质量控制方法：用精简核心保持行动一致，按需加载专业方法，围绕实际产物验收，减少遗漏和返工。

**当前版本：v0.8.4。** 在规则与工作流之外，新增宿主无关的 Runtime Core 和 Hermes、Codex App Server、Claude Agent SDK 三种 Adapter 原型。它们尚未连接真实宿主；不能把代码存在、mock 测试通过或 Adapter manifest 登记视为运行时已部署。

## 从哪里开始

- 想了解方法：先读 [Universal Core](../core/universal-core.md) 与 [Task Router](../core/task-router.md)。
- 想接入项目：按下方“快速开始”及 [适配入口](../adapters/README.md) 操作。
- 想执行复杂任务：读 [Task Orchestrator](../skills/task-orchestrator/SKILL.md)，到相应阶段再读 references。
- 想设计长期 AI 员工、岗位权限与 Agent 交接：读 [AI员工操作模型](agent-workforce-model.md)，按需使用角色、团队和交接模板。
- 想扩展或核验：查看下方扩展流程、[兼容性](compatibility.md)、[验收场景](acceptance-scenarios.md) 和 [进阶模式验收](agent-workflow-acceptance.md)。

## 目标与取舍

Agent OS 将第一性原理、逆向规划、风险前置、依赖管理、最小可行验证、对抗式审查与质量闸门变成可执行约束：先定义什么算完成，尽早验证最容易推翻方案的假设，再制作和验收完整成果。

简单任务直接做，复杂任务才编排；每轮修改对应真实缺陷。计划不是执行，工具成功不是验收，自审也不等于独立审查。我们希望提高交付效率，但第一版尚无减少返工、提升质量或节省 Token 的量化结论。

## 四层架构

| 层 | 负责的问题 | 本仓库载体 | 加载时机 |
| --- | --- | --- | --- |
| L1 Core | 如何判断、行动与选择流程 | `core/universal-core.md`、`core/task-router.md` | 启用进阶模式后读取 Core 与 Router |
| L2 Workflow | 复杂工作怎样拆解、执行、审查和验收 | `skills/task-orchestrator/`、`workflows/` 与 `templates/` | T2/T3 或确有编排需要；references 分阶段读取 |
| L3 Skills | 领域内怎样制作与验证 | 视觉、视频、软件、研究、现代 Web，以及横切的 `agent-architecture`、`agent-dispatcher`、`experience-curator`、`voice-command-router` | 路由命中领域制作、员工调度、经验沉淀或语音入口时 |
| L4 Project | 当前项目有哪些真实约束 | 宿主已有规范；缺失时可用项目上下文模板 | 先读取当前范围内项目规范 |

L2 用 Skill 格式承载工作流，是复用包装方式，不是新增第五层。`adapters/` 是宿主接入层，负责入口与路径，不另维护一套方法。L4 的内容属于各宿主项目，本仓库只提供可选模板，不能替代用户已有规范。

四层是职责划分，不是覆盖平台系统指令的优先级。冲突按宿主真实指令层级和明确任务授权处理；项目方法不能扩张权限。

## AI员工体系（横切治理，不是第五层）

七条 AI 员工原则作为横切治理层，覆盖现有 Core、Workflow、Skills 与 Project。它规定岗位契约、架构师设计流程、Agent 与 Skill 的边界、最小权限、经验晋升、结构化交接和自然语言/语音入口；跨宿主执行由独立 Runtime Adapter 层承接。

- 设计规范：[AI员工操作模型](agent-workforce-model.md)
- 员工岗位：[角色模板](../templates/agent-role.md)
- 团队设计：[团队方案模板](../templates/agent-team-design.md)
- 任务交接：[交接模板](../templates/agent-handoff.md)
- 经验晋升：沿用 [经验提案](../templates/experience-proposal.md)，先验证再经维护者审核。
- 架构师方法：[agent-architecture Skill](../skills/agent-architecture/SKILL.md)
- 团队工作流：[agent-team-design](../workflows/agent-team-design.md)
- 员工注册中心：[registry](../registry/README.md)，以 JSON Schema 和生命周期状态管理岗位。
- 员工调度中心：[agent-dispatcher Skill](../skills/agent-dispatcher/SKILL.md) 与 [agent-dispatch 工作流](../workflows/agent-dispatch.md)。
- 任务契约：[task.schema.json](../registry/schema/task.schema.json)；实际任务记录仅存于受控私有队列。
- 经验学习中心：[experience-curator Skill](../skills/experience-curator/SKILL.md)、[晋升工作流](../workflows/experience-promotion.md) 与 [提案 Schema](../registry/schema/experience-proposal.schema.json)。
- 语音指挥中心：[voice-command-router Skill](../skills/voice-command-router/SKILL.md)、[voice-command 工作流](../workflows/voice-command.md) 与 [命令 Schema](../registry/schema/voice-command.schema.json)。
- 运行时适配中心：[Runtime Adapter](../runtime/README.md)，统一任务、能力、事件与宿主协议；未部署的宿主不得接收正式任务。

这是设计与治理规范；Runtime Adapter 目前只有原型代码，不会自动创建已运行员工、持久任务队列、语音接口、记忆服务或跨应用权限。落地前必须核验宿主能力并进行隔离测试。

## 运行时适配中心：Runtime Adapter 跨宿主执行层

Runtime Adapter 是横切执行接入层，不是第五层业务方法，也不把 Hermes、Codex 或 Claude Code 固定为 Agent OS 的核心宿主。

- **Runtime Core**：定义统一任务 Envelope、能力状态、运行事件、员工资格、权限子集和幂等闸门。
- **Adapter**：负责协议映射。Hermes 使用 HTTP/SSE Runs API；Codex 使用 App Server JSON-RPC over stdio；Claude 使用 TypeScript Agent SDK query()。
- **Host Runtime**：实际模型、工具和 Agent loop 仍由外部宿主执行。
- **员工注册中心**：岗位生命周期与宿主适配器生命周期分开管理；Adapter 已实现不代表员工 approved/running。

实现入口：[runtime/README.md](../runtime/README.md)。三个 Adapter 当前全部为 prototype / draft / not_deployed；无默认宿主、无员工绑定、无真实运行证据。Hermes 有原生 Idempotency-Key（凭据级保留 24 小时）；Codex/Claude 需要 Agent OS 持久化幂等账本，未接入前派单必须阻塞。所有正式任务都要求宿主 permissionControls；Hermes 默认未核验，Claude 必须配置 permissionHandler。宿主权限必须由真实沙箱、工具策略和审批服务执行，不能依赖提示词声明。

## 目录结构

~~~text
Agent-OS/
├── README.md
├── CHANGELOG.md
├── core/
│   ├── universal-core.md
│   └── task-router.md
├── skills/
│   ├── agent-architecture/SKILL.md
│   ├── agent-dispatcher/SKILL.md
│   ├── experience-curator/SKILL.md
│   ├── voice-command-router/SKILL.md
│   ├── task-orchestrator/
│   │   ├── SKILL.md
│   │   └── references/
│   ├── visual-design/SKILL.md
│   ├── video-production/SKILL.md
│   ├── software-engineering/SKILL.md
│   ├── modern-web-guidance/SKILL.md
│   └── deep-research/SKILL.md
├── workflows/
│   ├── agent-team-design.md
│   ├── agent-dispatch.md
│   ├── experience-promotion.md
│   └── voice-command.md
├── registry/
│   ├── README.md
│   ├── registry.json
│   ├── agents/
│   └── schema/
├── runtime/
│   ├── README.md
│   ├── package.json
│   ├── registry.json
│   ├── registry.schema.json
│   ├── contracts/runtime-task.schema.json
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── hermes-http.mjs
│   │   │   ├── codex-app-server.mjs
│   │   │   └── claude-agent-sdk.mjs
│   │   ├── transports/jsonl-process-transport.mjs
│   │   ├── contracts.mjs
│   │   ├── events.mjs
│   │   ├── registry.mjs
│   │   ├── dispatch.mjs
│   │   └── index.mjs
│   └── test/runtime.test.mjs
├── experience/README.md
├── voice/README.md
├── templates/
│   ├── task-brief.md
│   ├── execution-plan.md
│   ├── review-report.md
│   ├── project-context.md
│   ├── experience-proposal.md
│   ├── agent-role.md
│   ├── agent-team-design.md
│   ├── agent-handoff.md
│   ├── agent-task.md
│   └── voice-command.md
├── adapters/
│   ├── README.md
│   ├── codex/
│   ├── claude/
│   └── hermes/
├── docs/
│   ├── compatibility.md
│   ├── agent-workforce-model.md
│   ├── acceptance-scenarios.md
│   ├── advanced-guide.md
│   └── original-prompt.md
├── scripts/
│   ├── check_docs.py
│   ├── check_agent_registry.py
│   ├── check_experience_proposals.py
│   ├── check_voice_commands.py
│   └── check_runtime_registry.py
└── .github/workflows/agent-os-checks.yml
~~~

## 渐进式加载（进阶模式）

1. **进阶启动入口**：明确启用进阶模式时，加载 Core、Router 与生效的项目规范。薄入口要使两份 Core 正文被实际读取，不只是放一个链接。
2. **任务路由**：T0 直接执行，T1 轻量规划，T2 完整编排，T3 增强风险保护。高风险即使步骤少也升级，出现新风险时重判。
3. **领域选择**：只读取当前相关 `SKILL.md`；原生发现可先读名称/描述，宿主不支持时由路由器按路径显式打开。
4. **阶段深入**：拆解时读拆解 reference，审查时读审查 reference，到闸门时读验收规则。模板在需要记录时打开，不强制每次填全套表。
5. **续作恢复**：记录已读版本、产物、证据与下一步；恢复时读摘要和变化文件，不重复注入整个库。

Markdown 链接不是导入语法；路由器是决策规则，不是调度程序。仓库根 `skills/` 不保证被宿主自动扫描。三种宿主的原生目录、配置、信任和云端行为都需按当前版本适配，详见 [兼容性说明](compatibility.md)。

## 快速开始：项目内显式读取

此处是可选文件接入步骤；只复制提示词的用户可跳过。本仓库不会自动修改其他项目或个人配置。

1. 先读取宿主项目已有规范、目录与未提交改动，确认 `.agent-os/` 未被占用。若已有同名目录，核对来源并复用或改路径，不覆盖未知文件。
2. 在宿主项目根检出完整仓库：

   ```sh
   git clone https://github.com/heroyagami/Agent-OS.git .agent-os
   git -C .agent-os rev-parse HEAD
   ```

   记录输出 commit 作为本次安装版本；团队接入可按现有规范固定为受审查的副本或 submodule。`main` 会变化，升级应先审阅 diff 再切换，不静默跟随。
3. 选择 [Codex](../adapters/codex/README.md)、[Claude Code](../adapters/claude/README.md) 或 [Hermes](../adapters/hermes/README.md)，将对应薄入口手工合并到宿主实际生效指令文件，保留已有内容。入口默认只读 Core；要使用本指南的完整流程，另明确启用进阶模式，再按需打开 Router。入口假定源目录是宿主项目根 `.agent-os/`；位置不同必须同步改路径。
4. 开新会话，要求 Agent 确认实际读取的 Core/Router 路径与源版本，做一次低风险小任务。再按 [验收场景](acceptance-scenarios.md) 检查按需加载、实际产物与权限边界。

进阶模式首次测试可以给 Agent 这段请求，无需先配置原生 Skill 目录：

```text
读取项目已有规范，再实际打开 .agent-os/core/universal-core.md 和
.agent-os/core/task-router.md。按任务路由执行下面的任务，只在需要时读取
相关 Skill/reference。简要记录路由、关键假设与验收证据，不展开内部推理。
任务：将指定标题改为我提供的新标题，并检查最终文件内容。
```

如果 Agent 不能访问文件，先解决路径、挂载或权限；不能把“知道文件名”当作已读取。不要把整个仓库复制到全局提示词。

## 可选安装方式

| 方式 | 适合场景 | 注意事项 |
| --- | --- | --- |
| 项目内显式读取（推荐起点） | 先验证方法，控制影响范围 | 完整源目录 + 薄入口；不要求自动发现 |
| 宿主原生 Skill 发现 | 希望用 Skill 目录/选择器路由 | 按适配文档安装完整 Skill，含 references；通用提示词仍需单独接入；Router 仅用于进阶模式 |
| 多 Agent 共享源目录 | 希望只维护一份源文件 | 入口改为可读的实际绝对路径，核实宿主支持与写权限 |
| 复制/固定版本到环境 | 云端、容器或不支持目录链接 | 记录源 commit 与本地差异；更新先比较，不覆盖用户修改 |

在完整源目录中维护改动；安装副本不能自动反向同步。符号链接、路径展开和外部目录功能因系统/宿主而异，Windows、WSL 与云端应分别验证。这里只交付接入说明，不提供一键安装器。

## 使用流程（进阶模式）

1. **定义成果**：明确用户要的结果、硬约束、交付位置与验收方法；区分事实、推断、假设。
2. **选择深度**：T0/T1 直接或轻量执行；T2/T3 使用 [任务简报](../templates/task-brief.md) 与 [执行计划](../templates/execution-plan.md)，也可沿用项目现有格式。
3. **风险先行**：逆向规划依赖图，标关键路径，做关键假设探针/MVP；只有输入稳定、写入不冲突且收益足够才并行。
4. **制作与整合**：逐阶段读取领域 Skill，按约定契约形成实际产物；MVP 之后仍要完成全部交付要求。
5. **审查与复验**：用 [审查报告](../templates/review-report.md) 记录反例、失败预演、P0–P3 缺陷、修复与证据。T3 需要独立审查，只有自审时明确缺口。
6. **交付与停止**：打开/运行/渲染或回读最终产物。硬性验收通过、P0/P1 清零、P2 已处理后交付；P3 按收益决定，不无限优化。
7. **经验候选**：记录有证据的根因与修复，通过 [经验提案](../templates/experience-proposal.md) 验证并经维护者审查，再更新局部 Skill；跨项目证据充分才提升到 Core。

### 例：一张课程封面

单张封面通常走 T1 + [visual-design](../skills/visual-design/SKILL.md)：确认平台尺寸与文案 → 低成本布局验证 → 背景/主体/字体/色彩分层制作 → 整体整合 → 打开真实导出，检查缩略图和裁切。若变成系列封面、多尺寸、多素材协作，再升 T2。

视频使用 [video-production](../skills/video-production/SKILL.md)，软件使用 [software-engineering](../skills/software-engineering/SKILL.md)，Web 页面与浏览器平台任务按需使用 [modern-web-guidance](../skills/modern-web-guidance/SKILL.md)，研究使用 [deep-research](../skills/deep-research/SKILL.md)。它们提供专业方法，具体生成、搜索、构建与发布依赖宿主工具和授权。

## 扩展与维护

新增 Skill 时创建 `skills/<name>/SKILL.md`，以 YAML frontmatter 提供唯一、与目录一致的 `name` 和具体触发条件 `description`；正文保持精简，专业细节拆为一层 references。加入路由表与 README，并提供至少一个正例、一个不应触发的反例和可观察的验收方式。

项目特有规则留在 L4；没有等效规范时用 [项目上下文模板](../templates/project-context.md)。不要在各 adapter 复制 Core；不要为了一个项目例外增加所有任务的全局负担。

共享规则更新必须有来源、适用条件、反例、回归案例与维护者审查。未经审查的任务经验只留候选记录；宿主自学习、共享目录自动更新也必须受实际权限约束，提示词不能提供写保护。

## 校验与验收

在 Agent OS 源目录运行（需要 Python 3.10+，无第三方依赖）：

```sh
python scripts/check_docs.py
python scripts/check_agent_registry.py
python scripts/check_experience_proposals.py
python scripts/check_voice_commands.py
python scripts/check_runtime_registry.py
npm test --prefix runtime
```

检查必要路径、相对链接及本仓库使用的标题锚点、Skill 基础元数据、精简篇幅、代码围栏、常见 Markdown 格式和入口路径。注册脚本检查 JSON 字段、引用、唯一 ID 与生命周期闸门；它不是完整 JSON Schema 验证器，也不证明 Agent 会遵从规则。

运行层验证按 [验收场景](acceptance-scenarios.md) 记录具体宿主、版本、会话类型和证据。适配依据及未验证项目见 [兼容性说明](compatibility.md)。

## 版本路线

| 版本 | 范围 | 发布条件 |
| --- | --- | --- |
| v0.1.0 历史 | 四层底座、五个 Skills、模板、薄适配、静态检查与验收场景 | 文档结构/引用/内容审查及远端写入核验；无三端兼容保证 |
| v0.2.3 历史 | 轻量首页与五个 Skills；新增方案竞选、分工与纠错学习参考 | 进阶方法按需阅读；真实运行效果待验证 |
| v0.2.4 历史 | 新增 Modern Web 专业 Skill 与按需路由；原有 Core 不变 | 外部 CLI 与宿主端到端行为仍需按环境验证 |
| v0.3.0 历史 | 在既有四层架构上增加 AI 员工治理、岗位/团队/交接模板与验收场景 | 文档与路由已整合；各宿主运行能力仍待验证 |
| v0.4.0 历史 | 新增 AI 架构师 Skill、团队设计工作流、JSON 员工注册中心和自动静态检查 | 岗位仅登记为 draft；运行时部署与宿主验证仍待完成 |
| v0.5.0 历史 | 新增员工调度 Skill、派单状态工作流、任务 Schema 和只读派单员岗位草案 | 任务队列尚未接入；只完成派单规则与契约 |
| v0.6.0 历史 | 新增经验学习 Skill、晋升工作流、提案 Schema 和隐私/正反例校验 | 不自动写入共享 Skill/Core；需维护者审查 |
| v0.7.0 历史 | 新增语音指挥 Skill、命令 Schema、确认/授权工作流和隐私校验 | 仅完成协议；音频采集、STT 和宿主队列尚未接通 |
| v0.8.0 历史 | 新增 Runtime Core、统一任务/事件契约、Hermes/Codex/Claude 三种 Adapter 原型和 Node.js mock 测试 | 真实宿主仍为 draft/not_deployed；无默认宿主、员工绑定和持久幂等账本 |
| v0.8.1 历史 | 所有正式任务强制 permissionControls；Hermes profile 权限核验、Claude 审批回调与权限模式收敛 | 三种宿主仍未连接真实运行环境；安全配置需在隔离环境完成 |
| v0.8.2 历史 | Claude 默认关闭本机 transcript 持久化，隔离本机设置与 MCP 配置 | 三种宿主仍为 prototype/not_deployed；无真实运行证据 |
| v0.8.3 历史 | Claude session resume 暂未启用；persistSession=false，直到安全外部 SessionStore 和临时配置目录清理验收完成 | 三种宿主仍为 prototype/not_deployed；无真实运行证据 |
| v0.8.4 当前 | Codex 本机 thread 持久化默认关闭；宿主与任务双重 opt-in 后才允许 submit | 三种宿主仍为 prototype/not_deployed；无真实运行证据 |
| 后续计划 | 按实际需求验证员工注册、宿主适配和代表任务运行 | 有版本化证据和实际需求，避免继续堆叠流程 |
| v1.0 目标 | 稳定规范、升级/回滚约定、经验证的适配范围 | 核心接口稳定且有跨任务、跨宿主的持续证据 |

这些是路线目标，不是日期承诺。当前版本号代表规则内容版本，不表示已经创建 Git tag、Release 或发布安装包；变更见 [CHANGELOG](../CHANGELOG.md)。

## 当前限制

- Runtime Adapter 目前只通过 mock transport/fetch/SDK 测试；未连接真实 Codex App Server、Claude Agent SDK 或 Hermes API Server，三者均保持 draft/not_deployed。
- Runtime Adapter 不自带模型、搜索/媒体引擎、持久任务队列、生产幂等账本、记忆数据库或强制权限隔离；没有宿主与工具就不能凭规则生成成品。
- 静态检查与自审不能证明执行质量、独立审查或安全隔离；重要任务仍需实际产物验证与适当人工/独立复核。
- 不能保证减少返工或节省成本；需收集真实任务样本后评估。法律、医疗、财务等基础研究方法不替代专业审查。
- 第一版不自动改写用户的其他项目、个人全局指令或共享 Skills；安装与后续经验更新须经过可审查的合并流程。
