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
| Hermes | HTTP API + SSE Runs API | 提交、状态、事件流、停止、审批、unknown-run 显式恢复；使用 Idempotency-Key | 幂等键按 API profile/凭据隔离并保留 24 小时；仅允许续接 API Server 自有 session；实际工具权限仍由服务端配置 |
| Codex | App Server JSON-RPC over stdio | 初始化、thread/turn、事件、停止、续接、审批响应；内置 JSONL 子进程传输 | sandbox/approvalPolicy 在 thread/start 或 thread/resume 设置，turn/start 只提交输入；只开放 read-only/workspace-write；外部网络/Connector 权限未映射 |
| Claude Code | TypeScript Agent SDK query() | 异步消息流、session resume、usage、关闭进程式取消、canUseTool 审批回调 | 不提供原生任务幂等键；必须使用持久化幂等账本；缺少 permissionHandler 时需审批的工具调用默认拒绝 |

官方接口依据：
- Hermes：[Programmatic Integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) · [API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- Codex：[App Server source and protocol](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- Claude：[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) · [TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)

## 选择与派单

RuntimeAdapterRegistry 先探测 Adapter，再根据任务所需能力筛选；不会把不可用宿主自动降级成成功。dispatchTask() 在调用宿主前检查员工生命周期、运行证据、任务审批和权限子集。T3 任务必须选择支持审批与权限控制的 Adapter；涉及写入/外部动作时必须确认宿主能实施相应权限边界。

Hermes Runs API 的 Idempotency-Key 按 API profile/凭据隔离，保留 24 小时，不是跨凭据的全局 exactly-once 保证。Codex App Server 与 Claude Agent SDK 的本适配没有原生任务幂等键，必须先接入 durable=true 的持久化幂等账本，否则派单阻塞。当前没有提供生产持久账本实现，不能用内存缓存替代。任何不确定是否执行成功的写入都应先对账，不得盲目重放。

## 宿主安全边界

- **Hermes**：Runs API 不能接管 CLI、TUI、Desktop、ACP 或消息平台拥有的 session。续接必须由可信控制面确认 session 属于 API Server。status=unknown 时先读取 admission_id 与 execution_generation，再由人工/控制面明确调用 resolveUnknown；禁止自动重放。
- **Codex**：sandbox 与 approvalPolicy 属于 thread 配置，不是 turn/start 字段。默认 read-only；只有任务已声明写权限、岗位授权且指定 workingDirectory 时才允许 workspace-write。danger-full-access 与外部网络/Connector 权限当前不开放。
- **Claude**：permissionPrompts=host 时由 canUseTool 回调处理审批；没有审批桥接时设置 permissionPrompts=none，拒绝需要交互批准的工具调用。query.close() 是关闭底层进程的强制取消，不等同于优雅中断。session resume 需要可信控制面确认 session 归属。
- **密钥**：Hermes API Key、Claude 凭据、Codex 登录状态均来自宿主安全配置，不写入 registry、仓库、日志或任务正文。

## 幂等账本接口约定

非原生幂等 Adapter 必须注入持久化 idempotencyStore，且声明 durable=true：
- reserve({ key, taskId, agentId }) 返回 reserved / replay / conflict / in_progress；
- replay 必须返回原任务 handle，不得重新 submit；
- commit({ key, handle }) 在宿主接受任务后持久化 handle；
- fail({ key, reason }) 记录确定的提交失败。状态不明时不能简单 fail 后重放，必须先与宿主对账。

## 安装与测试

本目录只依赖 Node.js 内置模块；Claude SDK 作为可选宿主依赖，由集成程序注入 query 函数。

~~~sh
node --test runtime/test/*.test.mjs
python3 scripts/check_runtime_registry.py
~~~

Hermes 使用 baseUrl 与 apiKey 注入，密钥只来自宿主安全配置/环境变量，不得写入仓库。Codex 默认启动 codex app-server，可注入其他符合 JSON-RPC transport 接口的实现。Claude 通过以下方式创建 Adapter：

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

## 当前状态

三个 Adapter 的代码均为 prototype。registry.json 中全部保持 lifecycle_status=draft、runtime_status=not_deployed，无默认宿主、无员工绑定、无运行证据。当前测试使用 mock transport/fetch/SDK stream，只证明接口映射与治理闸门，不证明已连接真实 Hermes、Codex 或 Claude 实例。

进入 configured/running 前，必须在隔离环境完成真实版本握手、认证、最小权限、审批往返、取消、事件恢复、幂等/重试和异常退出测试；再由维护者批准 Adapter 与员工岗位。真实 API Key、客户数据和任务正文不得提交到公开仓库。
