---
date: "2026-09-19T02:44:18.872Z"
symptom: "banmu-server: 1 水（farm_water）即可把从未开垦的土地槽位写成「已开垦/已浇水」并随意播种；且因 farm_water/farm_plant_seed/farm_harvest 都没有等级上限校验，1 级新号可用初始 100 水把 81 个槽位全部解锁种满，绕过 10 铜钱/块的开垦成本与 1 级 9 块的等级曲线。"
component: "banmu-server/game_actions.js"
severity: "major"
status: "open"
root_cause: "「已开垦」守卫与 land_cap 守卫只写在 farm_land_expand（game_actions.js:2401-2408 与 2392-2399）。farm_water（2281-2306）只扣 1 水后直接写 td=2/tk=2，无任何 td/tk 前置校验与 cap 校验；farm_plant_seed（2542-2601）只校验占位（2551）与背包（2560），tk 原值写回（2575 注释）；farm_harvest（2836+）同样无 cap 校验。因此 tk 被当作「可用性」真值（logic.service.ts:122,152 unlocked=tk>0、客户端 changjing_3d_grid.gd:438-462），却被无校验动作随意写入。"
fix: "未修复（对抗性审计发现，已入 .workbuddy/qa/adv/refute.md 的 P1-1 行并指出 Lead 低估）。建议修法：farm_water / farm_plant_seed / farm_harvest 入口统一前置校验 (a) 该槽已开垦（td[sk] 或 tk[sk] 为真，按 §3 语义表选定权威字段）(b) idx < maxUnlockedLandSlotExclusive(roleLv)，拒绝码 not_expanded / level_too_low；顺带给 /api/game/action 补最小鉴权（见关联）。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-server/fuwuqi.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - ".workbuddy/qa/adv/refute.md"
dsh_commit: "05e2dda00d"
---

发现路径：task-2 对抗性证伪 P1-1（「1 水把荒地变已开垦、绕过 10 铜钱」）时逐行核对 farm_water/farm_plant_seed 的校验链，确认 Lead 结论成立但危害被低估——真正严重的是三条农场动作都没有 land_cap 校验，只有 farm_land_expand 有，于是等级曲线（level_tujian_config.getLandCapByLevel：1 级 9 块 → 30 级 81 块）可被完全绕过。可达性：官方 UI 不可达（logic/index.vue:349-372 只在 unlocked=1 时渲染浇水/种植；客户端 2D/3D 面板按图集 (1,0)/(2,0) 才给按钮），但 fuwuqi.js:1210-1236 的 POST /api/game/action 无任何鉴权（只校验 yong_hu_id+type，GM 系路由才有 x-gm-token），故缓解只依赖「官方客户端不发这个请求」。验证方式（静态）：game_actions.js:2281-2306 / 2542-2601 / 2836+ / 2392-2399 / 2401-2408 逐行核对；EXPAND_LAND_COST=10、WATER_COST=1 见 :64-65。本会话 ssh_* 不可用（runtime: no server selected），未做线上写/读验证。
