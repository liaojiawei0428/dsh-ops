---
date: "2026-09-19T02:58:23.051Z"
symptom: "半亩芳华文字版：作物遭遇干旱/虫灾挂起后，界面仍按墙钟推进生长进度并提示\"已成熟\"，玩家点「收获」却被服务端以 not_mature 拒绝；灾难期间还会推送\"成熟提醒\"。"
component: "banmu-server（生长计时时基）"
severity: "major"
status: "fixed"
root_cause: "同一业务量（作物已生长秒数）在三处独立计算且时基不一致：farm_harvest 冻结在灾害触发时刻，而 load_data 的时间戳转换与 check_stage 的阶段判定都用纯墙钟差 now−plantTime，导致灾害挂起期间前端进度与成熟提醒继续推进。"
fix: "game_actions.js 新增并导出 elapsedSecondsForLoadData（灾难触发时以 min(now, at) 为有效当前时刻）；fuwuqi.js 的 load_data elapsed 转换与 check_stage 的 elapsed 均改调该函数，与 farm_harvest 的冻结语义统一。已部署。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-server/fuwuqi.js"
  - "autoload/save_data_manager.gd"
  - "banmu-admin/web/src/views/logic/index.vue"
---

调查过程：对抗审核员在证伪时发现客户端早有同一语义的实现（autoload/save_data_manager.gd 的 disaster_frozen_now，来自历史 BUG-091），而文字版链路没有跟上，属于"同链路语义未在 Web 补齐"。线上实测做了三数对账：播种时刻 plantTime=1789785625（DB 原始时间戳）、灾害段 dry:1789785660（at=1789785660）、服务器 now=1789785684，GET /api/load_data 返回的 elapsed[30]=59。计算：now−plantTime=59（与返回值完全一致，差 0 秒），at−plantTime=35，now−at=24（灾害确已触发 24 秒）⇒ 证明挂起期间计时照常累加、未做任何扣减。对照：无灾害的 slot 0 返回 elapsed=149=墙钟差（正常）。另发现 farm_disaster_recovery 执行时才把 plantTime 一次性补偿为 plantTime+(now−at)。根因：farm_harvest 用 logicNow = isHalted ? eventTime : nowSec 冻结生长，但 fuwuqi.js 的 load_data elapsed 转换是 nowSecLoad−plantTime（纯墙钟差），check_stage 的 elapsed 同样是纯墙钟差——三处时基不统一。修复：新增并导出 elapsedSecondsForLoadData(plantTs, cropPipeRaw, nowSec)，灾难已触发时用 effNow=min(now, at)；load_data 与 check_stage 均改用该时基。
