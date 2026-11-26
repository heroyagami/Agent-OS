# Agent OS Runtime Adapter

Runtime Adapter 是 Agent OS 的跨宿主执行接入层。它把员工注册、任务契约、权限/审批规则与具体 Agent 宿主解耦；不改变 Core、Workflow、Skills、Project 四层职责。

## 架构边界

1. **Runtime Core**：统一任务 Envelope、能力状态、事件、员工资格、权限子集和幂等闸门。
2. **Adapter**：把统一任务映射到宿主协议；把宿主事件、审批和终态映射回统一事件。
3. **Host Runtime**：真正运行模型、工具和 Agent loop 的外部进程/服务/SDK。
4. **Employee Registry**：仍是员工岗位与生命周期事实源；Runtime Registry 只登记宿主 Adapter，不替代员工注册中心。

Adapter 不拥有员工权限。员工 profile 必须同时为 approved/running 且有运行证据；任务权限必须是岗位批准权限的子集。宿主沙箱、API 权限和审批仍须独立配置。Markdown、JSON 或 adapter manifest 不是安全隔离。

## 统一接口

每个 Adapter 提供 probe()、submit()、getStatus()、streamEvents() 和 cancel()；支持时可提供 respondToApproval() 或 resolveUnknown()。能力必须由实际握手/探测确认，未知能力不能当作支持。

- 统一能力状态：supported / unsupported / unknown / not_configured
- 统一运行事件：run.started、run.progress、run.output.delta、run.approval.required、run.completed、run.failed、run.cancelled
- 任务 Envelope：contracts/runtime-task.schema.json
- 宿主注册索引：registry.json，结构由 registry.schema.json 定义
- 代码入口：src/index.mjs

## 首批宿主适配器

| Adapter | 官方接入面 | 本仓库实现 | 重要限制 |
| --- | --- | --- | --- |
| Hermes | HTTP API + SSE Runs API | 提交、状态、事件流、停止、审批、unknown-run 显式恢复；使用 Idempotency-Key | 幂等键按 API profile/凭据隔离并保留 24 小时；仅允许续接 API Server 自有 session；实际工具权限仍由服务端配置；只有在控制面核实该 profile 的工具 allowlist/denylist 与文件/网络边界后，才可显式设置 permissionControlsVerified=true；默认 not_configured，Runtime Core 会阻塞派单 |
| Codex | App Server JSON-RPC over stdio | 初始化、thread/turn、事件、停止、续接、审批响应；内置 JSONL 子进程传输 | sandbox/approvalPolicy 在 thread/start 或 thread/resume 设置，turn/start 只提交输入；只开放 read-only/workspace-write；外部网络/Connector 权限未映射；thread/start 默认持久化本机 transcript，submit 默认关闭，需 Adapter 与任务双重显式 opt-in |
| Claude Code | TypeScript Agent SDK query() | 异步消息流、usage、关闭进程式取消、canUseTool 审批回调；session resume 暂未启用 | 不提供原生任务幂等键；必须使用持久化幂等账本；必须注入 permissionHandler 才会被 Runtime Core 选中；固定 persistSession=false，不在本机保存 transcript |

官方接口依据：
- Hermes：[Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) · [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- Codex：[App Server source and protocol](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- Claude：[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) · [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)

## 选择与派单

RuntimeAdapterRegistry 先探测 Adapter，再根据任务所需能力筛选；不会把不可用宿主自动降级成成功。dispatchTask() 在调用宿主前检查员工生命周期、运行证据、任务审批和权限子集。所有正式任务都必须选择支持 permissionControls 的 Adapter；T3 任务还必须支持 approval。涉及写入/外部动作时必须确认宿主能实施相应权限边界。

Hermes Runs API 的 Idempotency-Key 按 API profile/凭据隔离，保留 24 小时，不是跨凭据的全局 exactly-once 保证；只有 /v1/capabilities 明确报告 runs_idempotency.supported=true 且 durable=true，才视为原生幂等。Codex App Server 与 Claude Agent SDK 没有本适配可用的原生任务幂等键，必须注入 durable=true 的 Agent OS 幂等账本，否则派单阻塞。当前提供单机文件型账本；它不是多机分布式数据库。

## 宿主安全边界

- **Hermes**：Runs API 不能接管 CLI、TUI、Desktop、ACP 或消息平台拥有的 session。续接必须由可信控制面确认 session 属于 API Server。status=unknown 时先读取 admission_id 与 execution_generation，再由人工/控制面明确调用 resolveUnknown；禁止自动重放。
- **Codex**：sandbox 与 approvalPolicy 属于 thread 配置，不是 turn/start 字段。默认 read-only；只有任务已声明写权限、岗位授权且指定 workingDirectory 时才允许 workspace-write。danger-full-access 与外部网络/Connector 权限当前不开放。thread/start 默认将 thread 和 transcript 持久化到本机；probe 默认 submit=not_configured，必须同时在 Adapter 构造时设置 allowLocalPersistence=true、并在单个任务设置 executionPolicy.allowLocalTranscriptPersistence=true，才可提交。启用前必须核验磁盘加密、访问控制及保留/删除策略。
- **Claude**：固定 permissionMode=default、permissionPrompts=host，并通过 canUseTool 回调处理审批；没有 permissionHandler 时回调默认拒绝，且 Runtime Core 不会选择该 Adapter。settingSources=[] 与 strictMcpConfig=true 用于隔离用户/项目设置及未声明的 MCP 连接；persistSession=false，不在本机持久化 transcript。query.close() 是关闭底层进程的强制取消，不等同于优雅中断。session resume 当前 not_configured。
- **密钥**：Hermes API Key、Claude 凭据、Codex 登录状态均来自宿主安全配置，不写入 registry、仓库、日志或任务正文。

## 持久化幂等账本

FileIdempotencyStore 是 Node.js 内置模块实现的本机持久化账本，不需要 Redis、SQLite 或额外 npm 依赖。它通过 SHA-256 保存幂等键摘要与任务身份摘要，不保存原始 prompt 或原始幂等键；只保存最小运行 handle。写入使用临时文件、fsync、原子替换和独占锁。POSIX 文件以 0600 创建并检查 group/other 权限；Windows 不由本实现检查或修改 NTFS ACL，部署者必须核验账本文件及父目录只允许 Runtime 服务账户访问。

~~~js
import { homedir } from "node:os";
import { join } from "node:path";
import { FileIdempotencyStore } from "./runtime/src/index.mjs";

const idempotencyStore = new FileIdempotencyStore({
  filePath: join(homedir(), ".agent-os", "runtime", "idempotency.json"),
});
~~~

- 文件必须放在受保护的本机目录，不能放入公开仓库、同步网盘或客户共享目录。
- Windows 部署不能把 0600 当作 ACL 保证；请用系统 ACL 工具核验账本文件和父目录的访问主体。
- 该实现面向单机 Runtime 控制进程；本机多个进程通过锁串行写入，但不提供跨机器分布式一致性。多机部署需另行实现带唯一约束/事务的数据库后端。
- 锁在进程异常退出后可能保留。系统不会自动删除疑似陈旧锁；必须先确认持锁进程已退出，再由维护者手动清理，否则继续 fail closed。
- 账本不自动清理历史记录。不得在未核对运行状态前删除 reserved/unknown 记录。
- reserve() 返回 reserved / replay / conflict / in_progress / unknown / failed；相同 key 不同任务或请求摘要返回 conflict。
- commit() 仅把已确认返回的 handle 写入账本；markUnknown() 将提交结果不明的任务隔离。
- resolve() 需要 actor 与 evidenceRef；accepted 必须提供真实 host handle，not_submitted 必须有证据证明宿主没有接收任务。not_submitted 进入 failed，后续新尝试须使用新幂等键。
- 任何 Adapter 提交或账本提交阶段发生异常，结果一律按 unknown 处理；不会自动把记录改为 failed 或盲目重试。未知状态须先向宿主对账。

## 幂等账本接口约定

非原生幂等 Adapter 必须注入 durable=true 的 idempotencyStore：
- reserve({ key, taskId, agentId, requestHash }) 返回 reserved / replay / conflict / in_progress / unknown / failed；
- replay 必须返回原任务 handle，不得重新 submit；冲突、在途、未知或失败状态一律阻塞。
- commit({ key, handle }) 在宿主接受任务后持久化 handle；markUnknown({ key, reason }) 隔离结果不明的提交。
- resolve({ key, resolution, handle, evidenceRef, actor }) 只允许有证据的 accepted 或 not_submitted 对账；不允许自动重试未知任务。

## 安装与测试

Runtime Core、文件账本与测试只依赖 Node.js 内置模块；Claude SDK 作为可选宿主依赖，由集成程序注入 query 函数。

~~~sh
node --test runtime/test/*.test.mjs
python3 scripts/check_runtime_registry.py
~~~

Hermes 使用 baseUrl 与 apiKey 注入，密钥只来自宿主安全配置/环境变量，不得写入仓库。permissionControlsVerified 默认为 false，不能仅凭管理员勾选；必须先完成 profile 工具策略和隔离测试，再由受信任控制面设置。Codex 默认启动 codex app-server，可注入其他符合 JSON-RPC transport 接口的实现。Claude 通过以下方式创建 Adapter。当前版本不接受 sessionId，默认不持久化会话 transcript：

~~~js
import { query } from "@anthropic-ai/claude-agent-sdk";
import { ClaudeAgentSdkAdapter } from "./runtime/src/index.mjs";

const adapter = new ClaudeAgentSdkAdapter({
  query,
  permissionHandler: async (request) => {
    // 将请求转发到受控审批服务；无审批服务时不要自动放行。
    return { behavior: "deny", message: "No approval service is configured." };
  },
});
~~~


## P0 治理增量（Pi-inspired，宿主无关）

- `buildTaskContext()`：由可信控制面选择领域 ID，按白名单加载 Core/Router/相关 Skill；去重，记录来源版本、SHA-256 和 UTF-8 字节数，超预算或缺文件即阻塞。不读取模型指定路径，不静默裁剪核心规则。字节预算不是模型实际 Token 或计费预算；领域选择目前由调用方负责，不是自动分类器。
- `dispatchWithContext()`：将编译后的上下文交给既有 `dispatchTask()`，沿用员工、能力、审批、持久幂等检查。相同幂等键不得改用不同上下文版本重放。调用方必须提供固定受审查版本的可信读取器，不允许从未审查项目、任意 URL 或模型输出读取治理指令。
- `createToolGate()`：受控工具注册、任务声明及可信授权三者交集；未知工具/未授权资源默认拒绝，写入或外部动作要求可信授权及结果核验，执行前后记录审计。仅适用于**实际通过该网关执行的工具**。可信注册工具必须自行规范化路径/资源、将执行绑定到规范化资源并防止符号链接、竞态及参数绕过。审计器、批准服务、验证器与工具实现必须由可信控制面提供，不能由模型控制。写入后核验失败不表示已回滚，按结果未知对账。
- `assertDelivery()`：显式验收项目及可信证据引用缺一不可；宿主 completed 不等于 delivered。调用方必须独立核实证据内容及来源，不能将模型自报结果视为可信验证。

以上 API 从 `src/index.mjs` 导出；测试见 `test/p0-governance.test.mjs`。原有 dispatchTask 保持兼容；新治理入口尚未接入实际宿主工具调用、持久审计和生产交付控制面。因此不能声称全部工具已强制经过网关，也不能声称已经完成真实宿主隔离。原有三个 Adapter 的部署状态不变。

### Pi 与 DeepSeek Harness 接入路线

两者作为候选宿主，不修改现有 runtime registry 的已部署状态。Pi 优先研究 SDK/RPC、工具事件、上下文注入与取消；DeepSeek Harness 优先研究插件注册、会话、工具权限和事件映射。均须实现既有 probe/submit/getStatus/streamEvents/cancel 契约，确认版本、真实权限隔离、审批与幂等能力，再进入 registry draft；未知能力不得伪报 supported。未完成协议适配及实测前不进入生产派单。

## 当前状态

三个 Adapter 的代码均为 prototype。registry.json 中全部保持 lifecycle_status=draft、runtime_status=not_deployed，无默认宿主、无员工绑定、无运行证据。当前测试使用 mock transport/fetch/SDK stream，只证明接口映射与治理闸门，不证明已连接真实 Hermes、Codex 或 Claude 实例。

进入 configured/running 前，必须在隔离环境完成真实版本握手、认证、最小权限、审批往返、取消、事件恢复、幂等/重试和异常退出测试；再由维护者批准 Adapter 与员工岗位。真实 API Key、客户数据和任务正文不得提交到公开仓库。
