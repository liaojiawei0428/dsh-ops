---
date: "2026-09-19T02:58:22.898Z"
symptom: "半亩芳华文字版：新号进入后农田页九块初始地显示\"荒地·尚未开垦\"，点「开垦」返回 already_expanded，且页面上不出现任何「种植」按钮，新号无法播种（连带新手主线\"一锹松土/种下第一颗种子\"卡住）。"
component: "banmu-server（土地字段双权威）"
severity: "critical"
status: "fixed"
root_cause: "\"是否已开垦\"存在 tk(客户端/文字版可用性权威) 与 td(服务端判定与统计权威) 两个字段，建档时默认值未成对写入（tk 全 0、td 前 9=1），且没有任何代码路径会把 tk 补成 1（save_data 剥离 tk/td、客户端自动修复只写本地、already_expanded 不在本地兜底白名单）。"
fix: "fuwuqi.js 新号建档 tu_di_kuo_jian 改用 dict_land（前 9 格=1）；game_actions.js migrateAndReconcileForLoadData 增加 tk/td 双向补齐迁移；farm_uproot 的 td 改为按铲除后 tk 同源推导。已部署验证：新号 /logic/view 由\"81 格/unlocked=1/种植按钮 0\"变为\"81 格/unlocked=9/种植按钮 8\"。"
related_files:
  - "banmu-server/fuwuqi.js"
  - "banmu-server/game_actions.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "scripts/changjing_3d_grid.gd"
---

调查过程：静态复核员逐 token 解析 fuwuqi.js 新号 INSERT 的 16 列与 13 个占位符+3 个字面量，产出列值对齐表，确认第 9 列 tu_di_kuo_jian ← dict_zero（全 0）、第 12 列 tu_di_zhuang_tai ← dict_land（前 9 格=1）。对抗审核员尝试推翻（搜索 12 条可能的"自动补 tk"路径：load_data 迁移、save_data 上传、客户端自动修复、本地兜底白名单等）全部不可达，判定"无法推翻且比原判更死"。线上实测：受控注入同语义临时号后，slot 0 开垦返回 already_expanded（服务端读 td）、slot 20 返回 level_too_low，两条开垦路径全断。Lead 用 /api/admin/logic/view 端到端确认：新号返回 grid=81 格、unlocked=1、可显示"种植"按钮的格子数=0。根因：同一个"是否已开垦"存在两个权威字段——客户端与文字版以 tk 判定可用性（BUG-090 契约），服务端以 td 判定重复开垦与统计已开垦数；建档时两字段默认值未成对写入。修复：①建档第 9 列改用 dict_land 对齐 td；②migrateAndReconcileForLoadData 增加存量 tk/td 双向补齐迁移（任一&gt;0 即视为已开垦，另一侧补 1，惰性随 load_data 触发落库）；③刻意保持文字版 unlocked 继续读 tk，不破坏既有契约（方案评审指出改读 td 会破坏客户端图集恢复、且 td 无法表达已种植态）。另修 farm_uproot 同类漂移：td 改由铲除后的 tk 同源推导。
