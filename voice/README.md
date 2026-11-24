# Voice Command Center

本目录说明语音指挥协议，不存储录音、完整转写或真实命令记录。

## 组件

- [语音解析 Skill](../skills/voice-command-router/SKILL.md)
- [语音命令工作流](../workflows/voice-command.md)
- [命令 Schema](../registry/schema/voice-command.schema.json)
- [命令模板](../templates/voice-command.md)
- [校验脚本](../scripts/check_voice_commands.py)

## 隐私与授权

- 原始音频和完整转写留在受控私有系统。
- 公开仓库只保留脱敏协议和虚构测试，不提交真实语音命令。
- 声纹/声音相似度不能替代已认证账户会话。
- 发布、删除、对外发送、付款、客户数据外发和生产变更必须明确回显对象、获得确认并通过原有审批。
- 语音识别置信度不是权限；低置信度和实体歧义必须澄清。

## 部署边界

该目录不提供麦克风接入、STT 服务、语音识别模型、移动端 UI 或任务队列。实际部署需要选择语音入口和 STT 提供方，并验证认证、隐私、任务队列和权限控制。
