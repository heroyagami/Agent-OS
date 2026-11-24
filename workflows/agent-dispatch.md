# Agent Dispatch 工作流

> 定义任务如何进入队列、匹配员工、经过授权闸门并完成交付。本文件是流程契约，不提供消息队列或 Agent 运行时。

## 输入与边界

输入：目标、请求人、验收条件、风险等级、截止时间、预算、输入资源引用、所需能力和请求权限。任务正文及客户文件只保存在受控私有存储；公开仓库仅保存 Schema 和规则。

## 员工资格

正式派单候选必须同时满足：
1. registry 中存在唯一 ID 和有效 profile；
2. lifecycle_status=approved；
3. runtime_status=running，并有可核验的近期宿主运行证据；
4. 岗位职责和 Skills 覆盖任务要求；
5. 任务所需权限是员工获批权限的子集；
6. 预算、依赖、审批和截止时间均可满足。

任何一项不满足，均不得标记为 assigned。configured 只代表配置完成，不等于运行可用。

## 状态机

| 当前状态 | 允许的下一状态 | 说明 |
| --- | --- | --- |
| received | triaged / cancelled | 接收并登记任务 |
| triaged | ready / blocked / approval_required / cancelled | 完成分类、资格和风险检查 |
| ready | assigned / blocked | 资格与权限通过后才能分配 |
| assigned | in_progress / blocked / failed | 员工确认接单并开始执行 |
| in_progress | review / blocked / failed | 执行结果进入审查或异常处理 |
| review | completed / in_progress / approval_required / failed | 通过、返工、待审批或失败 |
| approval_required | ready / blocked / cancelled | 审批通过后重新检查资格与预算 |
| blocked | triaged / ready / failed / cancelled | 阻塞解除后重新评估 |
| completed / failed / cancelled | 无 | 终态；重开须创建关联新任务 |

禁止跳过资格检查直接 assigned，禁止无证据 completed，禁止终态静默重开。

## 分派算法

1. 先判断当前任务是否能由当前 Agent 直接完成；能且风险低则不启动跨 Agent 派单。
2. 从 registry 读取岗位，不根据名称猜测能力，不向 draft 或未运行员工派单。
3. 先筛除状态不合格者，再比较职责、Skills、输入输出、数据等级和权限。
4. 选择满足全部约束且协调成本最低的最小团队；没有合适人选时阻塞并列出缺失能力。
5. 先指定一个任务负责人；并行子任务必须有独立输入、输出和写入边界。
6. T3 或高影响任务必须执行独立审查/人工审批闸门，派单员不得自批。

## 重试、幂等与失败

- 每个可写任务生成稳定 idempotency_key；同一逻辑任务重试沿用同一键。
- 重试前检查宿主执行记录和目标对象，确认上次没有成功写入。
- 仅对幂等动作进行有限重试；非幂等动作、状态不明或外部副作用先对账再处理。
- 超预算、超时、权限不足、连续失败或依赖失效时进入 blocked/failed，并记录责任人、原因和下一步。
- 不得通过重试次数、模型切换或更换 Agent 绕过审批和权限边界。

## 交接契约

每次交接记录任务 ID、发送方/接收方、状态、目标、输入引用及版本、已确认事实、假设、输出引用、验收证据、权限限制、审批、预算、阻塞和下一步。交接只传递工作上下文，不转移凭据或授权。使用 [Agent任务模板](../templates/agent-task.md) 与 [交接单](../templates/agent-handoff.md)。

## 运行时限制

注册中心和任务 Schema 不会自动创建队列、启动子 Agent、保存任务状态或隔离权限。只有目标宿主提供真实任务队列、Agent 调用、持久状态和权限控制，并完成隔离测试后，才可报告自动派单已部署。当前仓库只提供可校验的流程与配置草案。
