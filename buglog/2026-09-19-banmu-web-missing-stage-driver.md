---
date: "2026-09-19T03:31:05.460Z"
symptom: "半亩芳华文字版：作物永远不会遭遇干旱/虫灾（服务端灾害仅在客户端驱动的阶段检查中生成），浇水、除虫、灾后恢复、灾难暂停等链路在文字版无法验证也无法体验。"
component: "banmu-admin/web（文字版灾害链路）"
severity: "major"
status: "fixed"
root_cause: "check_stage 由客户端的植物实体按生长阶段（30%/70%/100%）定时驱动；文字版没有等价的阶段调度，且上一轮为解决\"空转/误触\"直接移除了入口，导致服务端永远不会收到该玩家的阶段检查请求，灾害链路整体不可达。"
fix: "index.vue 新增 advanceStageChecks()（阶段表 0.3/0.7/1.0 + 内存去重）与「推进阶段检查」按钮；farmCells 暴露 growSec/totalSec。已构建部署。"
related_files:
  - "banmu-admin/web/src/views/logic/index.vue"
  - "scripts/plants/plant_entity.gd"
  - "banmu-server/game_actions.js"
---

发现过程：方向调整为"文字版与服务端对齐"后重新审视上一轮对 check_stage 的处理。上一轮因"面板空转且补 slot:0 会污染存档"而直接移除了该入口，但这留下一个更根本的问题：文字版无法触发灾害，导致浇水/除虫/灾后恢复/灾难暂停这一整条链路在文字版既无法验证也无法体验，玩家种的作物永远不会遭灾。根因分析：check_stage 是客户端植物实体（scripts/plants/plant_entity.gd）按"生长阶段"驱动的动作——客户端在进度跨过 30%/70%/100%（_get_next_stage，_confirmed_stage 记录已确认阶段）时携带 {slot, growth_sec, threshold} 请求服务端，服务端据此掷灾害（未成熟时 50%，虫灾 4 成/干旱 6 成）并发成熟提醒。文字版只是"打开页面看数据"，没有任何阶段调度，服务端永远收不到该玩家的阶段检查。修复：①farmCells 暴露 growSec/totalSec；②新增 advanceStageChecks()，按同一阶段表遍历所有种植中地块，对"已跨过但未确认"的阶段调用 check_stage（threshold = 阶段×总时长），用内存 stageConfirmed 按 openid:slot 去重，避免同一阶段反复触发放大灾害概率；③"我的花坊"工具条加「推进阶段检查」按钮并 hover 说明。刻意不采用"打开页面自动执行"，否则管理员仅查看数据时也会持续掷骰。验证：测试号种植向日葵后连续调用 check_stage，第 2 次即命中 pest 灾害；随后 load_data 的 elapsed=6 而墙钟差 23、at-plantTime=6，确认计时冻结（同时复验上一轮 BUG-180 修复）；线上前端产物含「推进阶段检查」。教训：文字版要成为逻辑母版，必须复刻客户端的驱动方式（何时发请求），而不只是界面与接口。
