---
date: "2026-09-19T02:58:23.126Z"
symptom: "半亩芳华文字版：农田页格子数量随存档数据稀疏度变化（线上某存档只有 32 格而土地总量为 81），已开垦数量在服务端/文字版/管理端显示为 21/32/32 三个不同值；已开垦空地文案把\"未浇水\"写成\"湿润\"。"
component: "banmu-admin/logic（文字版渲染与统计）"
severity: "minor"
status: "fixed"
root_cause: "buildGrid 用\"数据字典的键并集\"决定渲染哪些槽位（格数随数据稀疏度变化），而非土地总量；叠加 tk/td 双权威导致已开垦数量的统计口径分裂；文案误用 tu_di_zhuang_tai 却按 tu_di_kuo_jian 的语义书写。"
fix: "logic.service.ts 的 buildGrid 槽位全集固定为 0..land_total-1；index.vue 修正文案按 td 语义、farmStats.total 取 land_total、统计文案并列显示两个口径、世界地图拼接灾害提示、未定位地块加「分配坐标」按钮、移除 check_stage 面板条目。已构建并部署 dist。"
related_files:
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
  - "banmu-admin/server/src/modules/players/players.service.ts"
---

调查过程：Lead 用 /api/admin/logic/view 实测线上 test_user_888，返回 grid 长度=32（slot 0..31）而 land_total=81；静态复核确认 buildGrid 的槽位全集由四张字典（tu_di_zhong_zhi/tu_di_zhuang_tai/tu_di_kuo_jian/tu_di_wang_ge）的键并集构成，与 land_total 无关。定级争议：Lead 原判 P0 并称"无法开垦新地"，对抗审核员用自动开垦路径证伪——index.vue 的「开垦一块新土地」走 farm_land_expand {} 会自动挑 cap 内首个未开垦槽位并写入新键，网格随新键出现而增长，故不构成链路阻断，定级降为 P2。另核实 cap 曲线（9+floor((L-1)*72/29)）在 11 级首次达到 33 块，届时若某存档键数仍为 32，该等级的第 33 块地在 UI 上不存在。同时发现统计口径三处不一致：服务端 landCapInfoForRow 数 td 且限 cap（21）、文字版 farmStats.unlocked 数全部 tk（32）、管理端 players.service.ts landStats 也数 tk（32）。另核对静态复核的边界结论：（新号建档写满 81 键）已由线上实测证实（新建号 tz/td/tk 各 81 键），故缺格只影响历史稀疏行。修复：①buildGrid 槽位全集固定为 0..land_total-1（默认 81、上限 128），格数与内容解耦；②farmStats.total 改取 server land_total；③统计文案改为同时展示两个口径；④顺带修文案颠倒（td=1 曾显示"湿润"）、世界地图已种作物不显示灾害、以及为未定位地块新增「分配坐标」入口；⑤从万能动作面板移除会空转且危险的 check_stage 条目。验证：修复后 /logic/view 对 888 返回 81 格/unlocked=32，对新号返回 81 格/unlocked=9；线上前端产物已含"分配坐标/已浇水 · 湿润/已开垦 · 待浇水"且不含"阶段检查"。
