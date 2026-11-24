---
name: modern-web-guidance
description: 检索 Google Chrome 的现代 Web 平台指导，覆盖浏览器 API、CSS、布局、性能、无障碍与兼容性。用于前端页面、浏览器交互和 Web 性能任务；不用于纯后端、原生移动端或纯 Remotion 时间线逻辑。
---

# Modern Web Guidance

## 定位与触发

这是外部专业知识源，不是 Agent、框架或测试工具。遇到 Web 页面、CSS、浏览器 API、响应式布局、动画、性能、无障碍或浏览器兼容性问题时按需调用；与 `software-engineering` 组合使用。纯后端、原生移动端、普通脚本和纯 Remotion 时间线任务不触发。

## 检索流程

1. 先读当前项目规范、框架版本和目标浏览器；确认问题确实属于 Web 平台。
2. 优先使用官方 CLI 检索，不预加载整套指南：
   ```sh
   npx modern-web-guidance@latest search "<具体开发问题>"
   npx modern-web-guidance@latest retrieve "<检索返回的 guide-id>"
   ```
3. 只取当前任务最相关的少量指南；不得猜测 guide ID、把搜索摘要当完整规范，或把全部指南塞进上下文。
4. CLI 不可用时，说明缺少的环境/网络条件；在授权范围内提供安装方式 `npx modern-web-guidance@latest install`，或使用官方仓库中的对应指南。不得谎称已检索。

## 应用原则

- 先检查项目现有技术栈、浏览器目标和兼容性基线，再决定是否采用新 API；不为“现代化”而无理由重写。
- 优先采用标准 Web 平台能力、渐进增强和轻量回退；对不支持的浏览器提供与任务风险相称的降级。
- 核对 Baseline/浏览器支持、已知限制、性能与无障碍影响；指南是技术依据，不代替项目测试。
- Origin Trial、尚未稳定或单引擎实验特性，除非用户明确授权并接受风险，否则不得用于生产实现；不得擅自开启 `.mwgrc` 实验选项。
- 实现后运行项目现有检查；涉及 UI、交互、布局或兼容性的变更，应在目标浏览器/自动化浏览器中验证真实行为。无法运行时明确标记未验证。
- 仅在当前需求有实际收益时引入指南建议；保留项目已有架构和用户修改，避免无关依赖、重构与性能回归。

## 隐私与来源

官方 CLI 在线运行时会发送匿名使用遥测，包括 Agent 名称、检索到的指南 ID 和生成的检索词；官方说明不收集原始用户提示词。用户或项目要求关闭时设置 `DISABLE_TELEMETRY=1`。不要把私密代码、客户资料或密钥写入检索词。

来源与更新：<https://github.com/GoogleChrome/modern-web-guidance>；源码与评测：<https://github.com/GoogleChrome/modern-web-guidance-src>。指南正文不复制进 Agent-OS，按官方许可与原始来源使用；更新前核对上游版本和变更。
