# Agent OS 入口片段

此片段合并到宿主项目根指令后生效；源仓库固定在项目 `.agent-os/`，路径从宿主项目根解析。

启动任务时，实际读取 `.agent-os/core/universal-core.md` 与 `.agent-os/core/task-router.md`；再按路由打开相关 Skill 和当前阶段的 reference，勿预读全部库。

先读取本项目已有规范；Agent OS 仅补充通用方法，按宿主真实指令优先级处理冲突，不扩大任务范围或权限。源路径不可读时明确报告，不假装已加载。

记录关键交付与实际验证证据；经验只记录为候选建议，不未经审查更新共享 Core/Skills 或全局配置。
