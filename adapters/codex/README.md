# Codex 接入

本说明以 2026-11-08 查阅的 [官方 AGENTS.md 文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md) 和 [官方 Skills 文档](https://learn.chatgpt.com/docs/build-skills) 为依据；不是针对所有 Codex 版本的运行保证。

日常可直接复制 [首页提示词](../../README.md)，跳过下列文件设置。

## 接入步骤

1. 按 [公共说明](../README.md) 将完整仓库固定版本放到项目 `.agent-os/`。
2. 读取项目根及适用子目录已有指令，把 [入口片段](AGENTS.md) 手工合并到实际生效的 `AGENTS.md`，保留用户原有内容。若当前有 override 或定制指令文件名，先核实优先级。
3. 新会话确认 Agent 实际读取 `.agent-os/core/universal-core.md` 和项目规范；默认不读 Router。只有明确启用进阶模式时才打开 `.agent-os/core/task-router.md`。普通 Markdown 链接不会自动加载正文。
4. 如需原生发现，可将完整 Skill 目录放到项目 `.agents/skills/` 或用户 `~/.agents/skills/`；发现范围、同名冲突和重载方式按安装版本核对。无需为了手工路由同时复制一份。

个人全局指令通常位于 `~/.codex/AGENTS.md`，自定义 `CODEX_HOME` 会改变位置。第一版推荐项目试用，验证后再手工合并精简全局入口；全局入口须使用稳定绝对源路径，不能照搬项目相对路径。

## 验收

询问“实际读取了哪些 Agent OS 文件、源版本是什么”，先执行标题修改，核对只使用通用提示词即可完成；另在明确启用进阶模式后测试复杂任务，核对按需读取。记录本机版本、表面（CLI/IDE/桌面/云）、目录和证据。此仓库尚未完成这些表面的原生安装测试。
