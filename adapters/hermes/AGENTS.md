# Agent OS 项目入口片段

合并到 Hermes 当前生效的宿主项目上下文文件中；不要覆盖原有规则。源固定在宿主项目根 `.agent-os/`，路径从宿主项目根解析。

任务启动时实际读取 `.agent-os/core/universal-core.md` 与 `.agent-os/core/task-router.md`；按需打开 Skill 及当前阶段 reference，避免预读整个库。

遵循宿主真实指令优先级；本入口不改变权限或身份。源不可读时报告具体路径与限制，不声称加载成功。经验先留项目记录，共享 Skills/Core 的变更须验证与维护者审查，不能直接自动维护源库。
