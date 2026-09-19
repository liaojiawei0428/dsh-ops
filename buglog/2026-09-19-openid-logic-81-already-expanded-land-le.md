---
date: "2026-09-19T02:44:19.114Z"
symptom: "新 openid 进「文字版游戏」（后台 /logic 页）后 81 格全显示「荒地·尚未开垦」且无任何播种入口：点单格「开垦」返回 already_expanded、点「开垦一块新土地」按钮因 land_left=0 被禁用（提示 9/9 已全部开垦），花坊页显示「土地 0/9 块已开垦」而世界地图提示显示「已开垦 9 · 可再开 0」，同一玩家两个数字自相矛盾。"
component: "banmu-server/fuwuqi.js"
severity: "major"
status: "open"
root_cause: "建号默认把两个土地状态数组写成互斥口径：fuwuqi.js:1064-1072 生成 dict_zero(全 81 键=0)/dict_null(全='0')/dict_land(前 9=1)，:1113-1131 按列序写入 —— tu_di_kuo_jian=dict_zero（全 0）、tu_di_zhong_zhi=dict_null、zuo_wu_sheng_zhang=dict_zero、tu_di_zhuang_tai=dict_land（前 9=1），:1134 日志亦写「默认可用地块9格」。而前端/后台「可用」判定取 tk（logic.service.ts:122,152 unlocked=Number(tk)>0 → 全 0），服务端「开垦守卫」与 land_opened 计数取 td（game_actions.js:2401 / 1104-1119 → 9/9）→ tk 与 td 在建号默认处即分叉，形成「td 说 9 块已开垦、tk 说一块都没开」的死锁。客户端侧不能自愈：save_data 剥离 tu_di_kuo_jian/tu_di_zhuang_tai（game_actions.js:27-31 + fuwuqi.js:1279），客户端本地自动修复（land_tool_panel.gd:74-81 把图集(1,0)对应 tk 修正为 1）只写本地快照。"
fix: "未修复（对抗性审计发现并复核，结论为「无法推翻」，见 .workbuddy/qa/adv/refute.md P0-2 行）。建议修法：①建号默认让 tk 与 td 一致（若产品口径是「新号预置 9 块可用地」则 tk 前 9 也写 1；若口径是「新号必须自己开垦」则 td 前 9 写 0 并同步 land_opened 口径）；②对存量行做一次性 tk/td 对齐迁移；③统一「已开垦」取数口径（前端 unlocked / 服务端 land_opened / 后台 players.service.ts:77-88 三处目前各取一个数组）。"
related_files:
  - "banmu-server/fuwuqi.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
  - "banmu-admin/server/src/modules/players/players.service.ts"
  - "autoload/save_data_manager.gd"
  - "scripts/changjing_3d_grid.gd"
  - ".workbuddy/qa/adv/refute.md"
dsh_commit: "05e2dda00d"
---

发现路径：task-2 对抗性证伪 P0-2。为确认「新号 tk 全 0 / td 前 9=1」不是 Lead 读错，用多份代码交叉验证：①用 python 逐 token 复核 fuwuqi.js:1113-1131 的 INSERT 列序（16 列 / 13 个 ? + 3 个 '{}'），确认第 9 列 tu_di_kuo_jian ← dict_zero、第 12 列 tu_di_zhuang_tai ← dict_land；②确认字段语义（开垦写 1/浇水写 2/种植写 3，game_actions.js:2418/2289/2576，与 BUG-090 图集约定一致）→ 不是语义误读；③确认前端门禁（logic/index.vue:349/370-371/2384）与开垦守卫（game_actions.js:2401-2408 already_expanded、landCapInfoForRead 1104-1119 → left=0 → index.vue:328 按钮禁用）；④确认客户端不能反向修复（game_actions.js:27-31 剥离 + fuwuqi.js:1279）。影响面：文字版是后台页（router/index.ts:59-62 需 super_admin/admin），故定 major 而非 critical；但同一默认数据在客户端也被按 tk 解读（changjing_3d_grid.gd:438-462「每个元素=1.0 表示已扩建」），玩家侧是否同样看不到初始 9 块地取决于本地 changjing_baifang_v1.json 是否自带 9 块土地贴图，本会话 ssh 不可用未能验证。唯一绕过手段是开发者工具手工发 farm_water（index.vue:2456），那正是另一条 open 记录里的越权路径。
