# Agent OS 入口片段

仅合并到宿主项目根 `CLAUDE.md`；以下路径以该文件位置解析。源目录为项目 `.agent-os/`。

@.agent-os/core/universal-core.md
@.agent-os/core/task-router.md

先遵循宿主实际生效的项目规范，按路由实际读取相关 Skill/reference；不预先导入整个库。缺失路径或不支持导入时报告，并显式打开同一文件，不能宣称已自动加载。

本入口不授权新工具、外部写入或自动更改共享规则。已有项目指令与导入须保留并按宿主优先级处理。
