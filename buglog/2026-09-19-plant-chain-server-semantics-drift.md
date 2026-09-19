---
date: "2026-09-19T02:52:45.548Z"
symptom: "文字版农田链路多处服务端语义不自洽：check_stage 的 elapsed 未按灾难冻结、farm_water 把 tu_di_zhuang_tai 从 3 覆盖为 2、farm_checkpoint 恒 out_of_sync 且无开垦校验"
component: "banmu-server/game_actions.js"
severity: "major"
status: "open"
root_cause: "1) game_actions.js:2943 check_stage 用 nowSec-plantTime 计算 elapsed，未像 farm_harvest(2855-2858) 那样按 eventTime 冻结，与 BUGS.md:1239(BUG-091) 记载的\"check_stage 亦冻结\"不符，导致灾难期误推成熟提醒；2) game_actions.js:2289 farm_water 无条件写 td=2，而 farm_plant_seed:2576 写 td=3，导致 tu_di_zhuang_tai 无法表达\"已种植\"状态；3) game_actions.js:2609 farm_checkpoint 用库内时间戳(zu)与客户端从 load_data 得到的 elapsed 比较，结构上恒 out_of_sync，且 2612 行可任意写 tu_di_kuo_jian，成为无校验的越权面；4) 客户端 GDScript 只读 tu_di_kuo_jian 做图集恢复(changjing_3d_grid.gd:438-466)，tu_di_wang_ge 全仓仅 4 处提及且均为注释/透传，故\"以 td 为唯一权威\"的方案会破坏客户端契约。"
fix: "尚未修复（本次为只读对抗性评审，产出评审报告 .workbuddy/qa/fix-review/plan-review.md）。建议修复：check_stage 与 load_data 统一按 min(now,eventTime) 冻结 elapsed；farm_water 不再改写 td（或仅在无作物时改写）；farm_checkpoint 补开垦/状态校验或标记废弃；td/tk 采用\"双写不变量+存量双向补齐迁移\"，禁止单侧降级。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-server/fuwuqi.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
  - "scripts/changjing_3d_grid.gd"
  - "autoload/farm_game_actions.gd"
  - "BUGS.md"
---

发现路径：对 Lead 的 F1-F10 修复方案草案做逐条只读核对时，交叉验证 game_actions.js/fuwuqi.js/logic.service.ts/index.vue/changjing_3d_grid.gd/BUGS.md。排除项：load_data 的 elapsed 转换(fuwuqi.js:1030-1043)只改内存 p 不写库，且 save_data 会剥离 zuo_wu_sheng_zhang(game_actions.js:27-31,4134-4144)，故不存在"elapsed 覆盖时间戳"的数据破坏路径；客户端 plant_entity.gd:620-631 对 elapsed/时间戳双兼容，故改 load_data 公式不会破坏客户端解析。验证方式：纯代码阅读+行号核对（本会话无 SSH 通道，未做线上复核）。关键影响：F5 只修 load_data 属半个修复；F2 候选 C 会把客户端土地恢复链打断；farm_checkpoint 是死接口+潜在后门。
