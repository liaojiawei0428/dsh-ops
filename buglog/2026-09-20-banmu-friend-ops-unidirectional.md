---
date: "2026-09-20T03:36:06.607Z"
symptom: "半亩芳华：删除好友后对方列表仍保留自己（单向僵尸好友）；好友栏只显示 openid 且没有查看对方资料的能力。"
component: "banmu-server/game_actions.js（好友关系）"
severity: "major"
status: "fixed"
root_cause: "好友关系是双向数据（分别存在双方 hao_you 中），但 friend_remove/friend_blacklist 只更新自己一行；同时缺少面向玩家的公开资料接口与好友昵称解析，导致\"查看\"无从实现、好友栏只能显示 openid。"
fix: "game_actions.js 新增 removeFriendFromBothSides 并接入 friend_remove/friend_blacklist；新增 player_view 动作（白名单式公开信息）；logic.service.ts 好友列表补昵称与等级；index.vue 好友栏五按钮 + 玩家信息弹窗 + 举报来源标记。已部署验证。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/api/modules.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
---

需求：好友栏每位好友要有私聊/查看/删除/拉黑/举报五个按钮，其中删除要"双方好友列表都清除"、拉黑要"屏蔽私聊和对方相关信息"。排查发现两个缺口：①friend_remove 只做 delete haoYou[target] 并只更新自己那一行，好友关系是双向数据（存在两个人的 hao_you 里），单侧删除形成"单向僵尸好友"——对方列表里仍保留着我；friend_blacklist 同理。②文字版 getView 用 dictKeysOf 只取 openid 列表，好友栏仅显示一串 openid；且服务端没有面向玩家的信息公开动作（guild_member_list 只覆盖同公会成员），"查看"按钮无从实现。修复：①新增 removeFriendFromBothSides(pool, uid, target) 读取对方行并从其 hao_you 中删除 uid 后落库，friend_remove 与 friend_blacklist 都调用它（拉黑同样解除双向关系，否则对方仍显示我为好友却发不出消息）；②新增服务端动作 player_view({target})，白名单式返回公开字段（昵称/花园名/等级经验/公会名与职位与贡献/好友数/图鉴收集/已开垦土地/入苑时间/称号 + 与我关系：是否好友、我是否拉黑他、他是否拉黑我、双方待处理申请），刻意不返回货币/背包/任务进度/剧情选择/健康值，查自己返回 self、查不到返回 not_found；③后台 getView 的好友列表按 openid 批量解析昵称与等级（friends 由 string[] 改为 [{openid,nickname,level}]），前端类型同步、同意申请后的本地追加逻辑同步适配；④前端新增玩家信息弹窗与好友行五按钮，私聊/拉黑/举报复用聊天昵称菜单既有实现，举报新增来源标记（聊天区记当前频道、好友栏记 friend）。验证：线上 888/999 实测删除后双方好友均为空、拉黑后同样双向清空且黑名单含对方、拉黑状态下私聊被拒（"你们还不是好友"，因关系已解除；游戏服另有基于双方黑名单的第二道拦截）、解除并恢复好友后私聊成功；player_view 返回昵称"测试花友"/公会"天天花园"/职位 huajiang/贡献 227，隐私字段全部为 None。所有测试数据已恢复。
