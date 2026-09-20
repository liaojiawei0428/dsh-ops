---
date: "2026-09-20T01:37:48.267Z"
symptom: "半亩芳华文字版：公会标签页只显示\"你尚未加入任何公会\"，公会后院面板完全不可见；但该玩家实际是公会花主（guild_id 后端返回空串）。"
component: "banmu-admin/server（logic.service.ts）"
severity: "major"
status: "fixed"
root_cause: "后台 logic.service.ts 的 gameFetch 从不发送 x-gm-token 头，而游戏服 /api/gm/* 路由要求该头，导致 getView 永远拿不到 guild_id（恒为空串）；前端又用 guild_id 控制整个公会区块的显隐，于是一块 UI 静默消失且无任何报错。"
fix: "logic.service.ts：gameFetch 增加 withGmToken 参数并在该分支附带 x-gm-token 头；getView 中 /api/gm/player-guild 调用改为传 true。已部署并验证。"
related_files:
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
---

用户反馈："公会标签页里没有后院"。排查路径：①先怀疑缓存，核对线上 dist 产物确认后院代码已上线（含「公会后院」「开启公会后院」文案）；②直接调后端 /api/admin/logic/view?openid=test_user_888，发现 guild_id 返回空字符串，而前端模板用 v-if="view.guild_id" 包住整个后院区块 —— 空值即整块不渲染；③但同一时刻直接 curl 游戏服 /api/gm/player-guild 却返回 {"ok":true,"guild_id":"g_10004"}，说明游戏服没问题，问题在后台调用侧；④读 logic.service.ts 的 gameFetch 实现，发现它只发送 Content-Type 头，从不发送游戏服 /api/gm/* 要求的 x-gm-token，而 getView 里 if (gm.token) 判断通过后调用该接口必然被拒，guildId 因此永远保持初始空串。修复：gameFetch 增加 withGmToken 参数（true 时附带 headers['x-gm-token']），getView 查公会那一处传 true。验证：修复后 /logic/view 对 888/999 均返回 guild_id='g_10004'；再走前端真实路径 POST /logic/run {type:'guild_info'} 得到 ok=true、enabled=true、my_role=huazhu、can_manage=true、manage_roles=['huazhu']、cells 六格齐全。
