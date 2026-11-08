# Agent OS

一套供智能体复用的任务执行与质量控制方法：用精简核心保持行动一致，按需加载专业方法，围绕实际产物验收，减少遗漏和返工。

**当前版本：v0.1.0（第一版文档与规则底座）。** 面向 Codex、Claude Code、Hermes 提供薄适配方案；尚未完成三种宿主的版本化安装与端到端验证。它是一套可读取的规则与工作流，不是新的 Agent 运行时，也不附带工具能力或权限。

## 从哪里开始

- 想了解方法：先读 [Universal Core](core/universal-core.md) 与 [Task Router](core/task-router.md)。
- 想接入项目：按下方“快速开始”及 [适配入口](adapters/README.md) 操作。
- 想执行复杂任务：读 [Task Orchestrator](skills/task-orchestrator/SKILL.md)，到相应阶段再读 references。
- 想扩展或核验：查看下方扩展流程、[兼容性](docs/compatibility.md) 和 [验收场景](docs/acceptance-scenarios.md)。

## 目标与取舍

Agent OS 将第一性原理、逆向规划、风险前置、依赖管理、最小可行验证、对抗式审查与质量闸门变成可执行约束：先定义什么算完成，尽早验证最容易推翻方案的假设，再制作和验收完整成果。

简单任务直接做，复杂任务才编排；每轮修改对应真实缺陷。计划不是执行，工具成功不是验收，自审也不等于独立审查。我们希望提高交付效率，但第一版尚无减少返工、提升质量或节省 Token 的量化结论。

## 四层架构

| 层 | 负责的问题 | 本仓库载体 | 加载时机 |
| --- | --- | --- | --- |
| L1 Core | 如何判断、行动与选择流程 | `core/universal-core.md`、`core/task-router.md` | 接入后每次任务读取两份精简文件 |
| L2 Workflow | 复杂工作怎样拆解、执行、审查和验收 | `skills/task-orchestrator/` 与 `templates/` | T2/T3 或确有编排需要；references 分阶段读取 |
| L3 Skills | 领域内怎样制作与验证 | 视觉、视频、软件、研究四个 Skill | 路由命中当前领域时 |
| L4 Project | 当前项目有哪些真实约束 | 宿主已有规范；缺失时可用项目上下文模板 | 先读取当前范围内项目规范 |

L2 用 Skill 格式承载工作流，是复用包装方式，不是新增第五层。`adapters/` 是宿主接入层，负责入口与路径，不另维护一套方法。L4 的内容属于各宿主项目，本仓库只提供可选模板，不能替代用户已有规范。

四层是职责划分，不是覆盖平台系统指令的优先级。冲突按宿主真实指令层级和明确任务授权处理；项目方法不能扩张权限。

## 目录结构

```text
Agent-OS/
├── README.md
├── CHANGELOG.md
├── core/
│   ├── universal-core.md
│   └── task-router.md
├── skills/
│   ├── task-orchestrator/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── task-decomposition.md
│   │       ├── adversarial-review.md
│   │       └── quality-gates.md
│   ├── visual-design/SKILL.md
│   ├── video-production/SKILL.md
│   ├── software-engineering/SKILL.md
│   └── deep-research/SKILL.md
├── templates/
│   ├── task-brief.md
│   ├── execution-plan.md
│   ├── review-report.md
│   ├── project-context.md
│   └── experience-proposal.md
├── adapters/
│   ├── README.md
│   ├── codex/              # README.md、AGENTS.md
│   ├── claude/             # README.md、CLAUDE.md
│   └── hermes/             # README.md、AGENTS.md、SOUL.md
├── docs/
│   ├── compatibility.md
│   └── acceptance-scenarios.md
└── scripts/
    └── check_docs.py
```

## 渐进式加载

1. **启动入口**：仅加载 Core、Router 与生效的项目规范。薄入口要使两份 Core 正文被实际读取，不只是放一个链接。
2. **任务路由**：T0 直接执行，T1 轻量规划，T2 完整编排，T3 增强风险保护。高风险即使步骤少也升级，出现新风险时重判。
3. **领域选择**：只读取当前相关 `SKILL.md`；原生发现可先读名称/描述，宿主不支持时由路由器按路径显式打开。
4. **阶段深入**：拆解时读拆解 reference，审查时读审查 reference，到闸门时读验收规则。模板在需要记录时打开，不强制每次填全套表。
5. **续作恢复**：记录已读版本、产物、证据与下一步；恢复时读摘要和变化文件，不重复注入整个库。

Markdown 链接不是导入语法；路由器是决策规则，不是调度程序。仓库根 `skills/` 不保证被宿主自动扫描。三种宿主的原生目录、配置、信任和云端行为都需按当前版本适配，详见 [兼容性说明](docs/compatibility.md)。

## 快速开始：项目内显式读取

此处是供接入者执行的步骤；第一版的仓库实施不会自动修改你的其他项目或个人配置。

1. 先读取宿主项目已有规范、目录与未提交改动，确认 `.agent-os/` 未被占用。若已有同名目录，核对来源并复用或改路径，不覆盖未知文件。
2. 在宿主项目根检出完整仓库：

   ```sh
   git clone https://github.com/heroyagami/Agent-OS.git .agent-os
   git -C .agent-os rev-parse HEAD
   ```

   记录输出 commit 作为本次安装版本；团队接入可按现有规范固定为受审查的副本或 submodule。`main` 会变化，升级应先审阅 diff 再切换，不静默跟随。
3. 选择 [Codex](adapters/codex/README.md)、[Claude Code](adapters/claude/README.md) 或 [Hermes](adapters/hermes/README.md)，将对应薄入口手工合并到宿主实际生效指令文件，保留已有内容。入口假定源目录是宿主项目根 `.agent-os/`；位置不同必须同步改路径。
4. 开新会话，要求 Agent 确认实际读取的 Core/Router 路径与源版本，做一次低风险小任务。再按 [验收场景](docs/acceptance-scenarios.md) 检查按需加载、实际产物与权限边界。

首次测试可以直接给 Agent 这段请求，无需先配置原生 Skill 目录：

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
| 宿主原生 Skill 发现 | 希望用 Skill 目录/选择器路由 | 按适配文档安装完整 Skill，含 references；Core/Router 仍需单独接入 |
| 多 Agent 共享源目录 | 希望只维护一份源文件 | 入口改为可读的实际绝对路径，核实宿主支持与写权限 |
| 复制/固定版本到环境 | 云端、容器或不支持目录链接 | 记录源 commit 与本地差异；更新先比较，不覆盖用户修改 |

在完整源目录中维护改动；安装副本不能自动反向同步。符号链接、路径展开和外部目录功能因系统/宿主而异，Windows、WSL 与云端应分别验证。这里只交付接入说明，不提供一键安装器。

## 使用流程

1. **定义成果**：明确用户要的结果、硬约束、交付位置与验收方法；区分事实、推断、假设。
2. **选择深度**：T0/T1 直接或轻量执行；T2/T3 使用 [任务简报](templates/task-brief.md) 与 [执行计划](templates/execution-plan.md)，也可沿用项目现有格式。
3. **风险先行**：逆向规划依赖图，标关键路径，做关键假设探针/MVP；只有输入稳定、写入不冲突且收益足够才并行。
4. **制作与整合**：逐阶段读取领域 Skill，按约定契约形成实际产物；MVP 之后仍要完成全部交付要求。
5. **审查与复验**：用 [审查报告](templates/review-report.md) 记录反例、失败预演、P0–P3 缺陷、修复与证据。T3 需要独立审查，只有自审时明确缺口。
6. **交付与停止**：打开/运行/渲染或回读最终产物。硬性验收通过、P0/P1 清零、P2 已处理后交付；P3 按收益决定，不无限优化。
7. **经验候选**：记录有证据的根因与修复，通过 [经验提案](templates/experience-proposal.md) 验证并经维护者审查，再更新局部 Skill；跨项目证据充分才提升到 Core。

### 例：一张课程封面

单张封面通常走 T1 + [visual-design](skills/visual-design/SKILL.md)：确认平台尺寸与文案 → 低成本布局验证 → 背景/主体/字体/色彩分层制作 → 整体整合 → 打开真实导出，检查缩略图和裁切。若变成系列封面、多尺寸、多素材协作，再升 T2。

视频使用 [video-production](skills/video-production/SKILL.md)，软件使用 [software-engineering](skills/software-engineering/SKILL.md)，研究使用 [deep-research](skills/deep-research/SKILL.md)。它们提供专业方法，具体生成、搜索、构建与发布依赖宿主工具和授权。

## 扩展与维护

新增 Skill 时创建 `skills/<name>/SKILL.md`，以 YAML frontmatter 提供唯一、与目录一致的 `name` 和具体触发条件 `description`；正文保持精简，专业细节拆为一层 references。加入路由表与 README，并提供至少一个正例、一个不应触发的反例和可观察的验收方式。

项目特有规则留在 L4；没有等效规范时用 [项目上下文模板](templates/project-context.md)。不要在各 adapter 复制 Core；不要为了一个项目例外增加所有任务的全局负担。

共享规则更新必须有来源、适用条件、反例、回归案例与维护者审查。未经审查的任务经验只留候选记录；宿主自学习、共享目录自动更新也必须受实际权限约束，提示词不能提供写保护。

## 校验与验收

在 Agent OS 源目录运行（需要 Python 3.10+，无第三方依赖）：

```sh
python scripts/check_docs.py
```

检查必要路径、相对链接及本仓库使用的标题锚点、Skill 基础元数据、精简篇幅、代码围栏、常见 Markdown 格式和入口路径。脚本只读，不联网；不验证外链可用性，不是完整 Markdown 解析器，也不证明 Agent 会遵从规则。

运行层验证按 [验收场景](docs/acceptance-scenarios.md) 记录具体宿主、版本、会话类型和证据。适配依据及未验证项目见 [兼容性说明](docs/compatibility.md)。

## 版本路线

| 版本 | 范围 | 发布条件 |
| --- | --- | --- |
| v0.1.0 当前 | 四层底座、五个 Skills、模板、薄适配、静态检查与验收场景 | 文档结构/引用/内容审查及远端写入核验；无三端兼容保证 |
| v0.2 计划 | 固定版本的三端接入验证、重复名称与云端案例 | 记录版本矩阵、实际加载和产物证据 |
| v0.3 计划 | 代表任务回归集、成本与返工指标、更多专业 Skills | 有对照数据与回归记录，避免仅凭主观评价 |
| v1.0 目标 | 稳定规范、升级/回滚约定、经验证的适配范围 | 核心接口稳定且有跨任务、跨宿主的持续证据 |

这些是路线目标，不是日期承诺。当前版本号代表规则内容版本，不表示已经创建 Git tag、Release 或发布安装包；变更见 [CHANGELOG](CHANGELOG.md)。

## 当前限制

- 未完成 Codex / Claude Code / Hermes 的版本化原生安装与端到端测试；目录与配置需按实际版本重新核实。
- 未自带工具、模型、搜索/媒体引擎、执行器、记忆数据库或强制权限控制；没有工具就不能凭规则生成成品。
- 静态检查与自审不能证明执行质量、独立审查或安全隔离；重要任务仍需实际产物验证与适当人工/独立复核。
- 不能保证减少返工或节省成本；需收集真实任务样本后评估。法律、医疗、财务等基础研究方法不替代专业审查。
- 第一版不自动改写用户的其他项目、个人全局指令或共享 Skills；安装与后续经验更新须经过可审查的合并流程。
