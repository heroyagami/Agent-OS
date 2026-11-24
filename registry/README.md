# AI员工注册中心

注册中心是 Agent OS 员工身份、岗位边界和生命周期状态的唯一索引。它管理配置声明，不是 Agent 运行时。

## 目录

- [注册索引](registry.json)：所有已登记 Agent 与团队。
- [Agent Schema](schema/agent.schema.json)：单个员工配置格式。
- [Registry Schema](schema/registry.schema.json)：注册索引格式。
- [Task Schema](schema/task.schema.json)：派单任务元数据契约。
- [Voice Command Schema](schema/voice-command.schema.json)：语音命令的脱敏元数据契约。
- [AI派单员岗位卡](agents/agent-dispatcher.json)：首个派单岗位草案。
- [派单工作流](../workflows/agent-dispatch.md)：状态、资格、权限、预算与升级规则。
- [AI架构师岗位卡](agents/ai-architect.json)：首个架构师岗位定义，目前仅为草案。
- [架构师 Skill](../skills/agent-architecture/SKILL.md) · [团队设计工作流](../workflows/agent-team-design.md)。

## 生命周期

| lifecycle_status | 含义 | 是否允许派单 |
| --- | --- | --- |
| draft | 尚未审阅 | 否 |
| in_review | 等待维护者/用户审查 | 否 |
| approved | 岗位定义和权限已获批准 | 仍需确认宿主已配置 |
| retired | 已退役 | 否 |

runtime_status 独立记录真实运行状态：
- not_deployed：尚无宿主部署。
- configured：宿主配置完成，但未证明持续运行。
- running：已有宿主执行证据和最近验证记录。
- suspended：已暂停。
- unknown：无法核实。

当前 AI 架构师和 AI 派单员均为 **draft / not_deployed**，不是已经运行的 Agent。

## 新增员工流程

1. 检查现有 ID、岗位、Skills、Workflows 和工具，避免重复。
2. 参考 [AI架构师岗位卡](agents/ai-architect.json)，按 [Schema](schema/agent.schema.json) 编写新 profile。
3. 使用唯一小写 kebab-case ID，将 profile 放在 agents/。
4. 在 registry.json 增加索引，保持 ID、profile 路径及状态一致。
5. 运行 python3 scripts/check_agent_registry.py 和 python3 scripts/check_docs.py。
6. 维护者审查权限、数据、预算、审批、停止条件和验收证据，再批准变更。
7. 实际部署须按目标宿主配置并进行隔离测试和运行验证。
8. 任务记录按 [Task Schema](schema/task.schema.json) 生成，但正文和客户数据只进入受控私有队列，不提交公共仓库。

## 最小权限与隐私

- 工具采用显式 allowlist；未列入的工具默认不可用。
- 读、写、发布、删除、外发和资金操作分开授权；交接不转移凭据。
- 不在公开仓库保存 API Key、Token、客户原始材料或敏感个人信息。
- null 预算代表尚未配置，不代表无限额度；预算未设定不得部署。
- 提示词中的禁止语句不是技术隔离；实际限制必须由宿主/工具权限实现。

## 变更纪律

注册索引和岗位卡必须一起修改。不得只改索引；不得把 draft 直接改成 running；权限扩张、外部动作或部署必须有审批和可核验的宿主证据。
