---
date: "2026-09-20T04:07:41.903Z"
symptom: "文字版私聊记录/系统消息/好友行等把 openid、公会ID、场景编号直接显示给玩家"
component: "banmu-admin/logic 文字版"
severity: "major"
status: "fixed"
root_cause: "聊天消息只落了发送者昵称，接收者 to_openid 没有昵称字段；系统消息 sender 在好友申请类消息里存 openid；前端展示层统一用 `nickname || openid` 兜底并直接插值——数据层缺字段与展示层无约定叠加，导致缺昵称时把内部标识渲染给玩家。"
fix: "数据层补昵称字段（from_nickname/to_nickname/sender_nickname/guild_name）+ 反向昵称解析（resolvePlayerId）+ 展示层统一昵称（nickOf/toNickOf，禁止 || openid 兜底，物品兜底改\"未知物品\"）。改动 5 个文件，三端已部署。"
related_files:
  - "F:\\QiTa\\banmu\\banmufanghua\\banmu-admin\\web\\src\\views\\logic\\index.vue"
  - "F:\\QiTa\\banmu\\banmufanghua\\banmu-admin\\server\\src\\modules\\chat\\chat.service.ts"
  - "F:\\QiTa\\banmu\\banmufanghua\\banmu-admin\\server\\src\\modules\\logic\\logic.service.ts"
  - "F:\\QiTa\\banmu\\banmufanghua\\banmu-server\\fuwuqi.js"
  - "F:\\QiTa\\banmu\\banmufanghua\\BUGS.md"
---

用户反馈：私聊记录显示 "09-20 11:47新园主·终验 → test_user_999 ：你好啊"，接收者一栏是 openid，要求玩家可见文案必须是昵称，openid 只在程序内部使用。

审计范围：banmu-admin/web/src/views/logic/index.vue 全量扫描 `{{...}}`、placeholder、:title、ElMessage 文案，共 9 个显示点（身份栏、顶部公会标签、聊天昵称、私聊接收者、私聊对象输入框、举报弹窗、玩家信息弹窗、系统消息来源、好友行、黑名单行、公会面板、场景侧栏）。

根因两层：①数据层缺字段——chat_messages 只落发送者昵称（nickname），to_openid 无昵称；system_messages.sender 在好友申请类消息里是 openid；②展示层无约定——前端一律写 `x.nickname || x.openid` 兜底后直接插值，缺昵称就露 ID。

修复：
1) chat.service.ts 新增 nicknamesOf(ids) 批量解析昵称；listMessages 输出 from_nickname/to_nickname，listSystemMessages 输出 sender_nickname。
2) 新增 resolvePlayerId(keyword)（openid 精确 → 昵称模糊），sendMessage 的 to_openid 与 playerAction 的 target 先解析，玩家可用昵称选人；logic.service.ts 新增 nicknameMapOf / playerExists / resolveOpenidByNickname，getView 支持用昵称进入。
3) 前端新增 nickOf/toNickOf（兜底"花友"，不再回退 openid）；私聊对象改好友下拉；各弹窗与列表去 ID；itemName/stringId 兜底改"未知物品/未知资产"。
4) fuwuqi.js 的 /api/gm/player-guild 增加 guild_name，公会标签显示"天天花园"而非 g_10004。

验证：线上实测 chat/messages 返回 to_nickname="测试花友"；用昵称"测试花友"当收件人发私聊成功且落库 to_openid=test_user_999；系统消息 sender_nickname 正确；logic/view guild_name=天天花园；浏览器刷新后 placeholder 已变为"输入玩家昵称或玩家ID"；对构建产物逐段审计 16 处含中文的 openid 片段，全部为内部参数传递，无一处渲染。

部署：游戏服 fuwuqi.js（宝塔重启，health ok）+ admin server dist（端口定位重启，新 PID 49817）+ web dist（54 文件，入口 chunk index-CqaXZs6y.js）。
