---
date: "2026-09-19T02:44:02.341Z"
symptom: "从未开垦的地块（tu_di_kuo_jian=0 且 tu_di_zhuang_tai=0）可直接 farm_water 浇水并 farm_plant_seed 播种成功，绕过开垦与等级上限（线上实测 slot 30 均 ok:true）"
component: "banmu-server/game_actions.js（farm_water / farm_plant_seed）"
severity: "major"
status: "open"
root_cause: "game_actions.js 的 farm_water 与 farm_plant_seed 分支缺少地块开垦前置校验：farm_water 仅做水资源扣减后直接写 tu_di_zhuang_tai[sk]=2、tu_di_kuo_jian[sk]=2；farm_plant_seed 未检查 tu_di_zhuang_tai/tu_di_kuo_jian 即写入种子与播种时间。开垦校验只存在于 farm_land_expand 分支（cap/已开垦判定）。"
fix: "尚未修复（只实测取证）。建议在 farm_water / farm_plant_seed 入口补开垦校验：要求 tu_di_zhuang_tai[sk] 已开垦（或 tk[sk] 为 1/2），否则返回 not_expanded 类错误码。"
related_files:
  - "/www/wwwroot/sparrow-logic/banmu-server/game_actions.js"
  - ".workbuddy/qa/probe/evidence.md"
  - ".workbuddy/qa/probe/raw/e4_water_slot30.out"
  - ".workbuddy/qa/probe/raw/e4_plant_slot30.out"
---

实测（临时号 qa_probe_785484，E4）：slot 30 操作前 tu_di_kuo_jian[30]=0 且 tu_di_zhuang_tai[30]=0（从未开垦）。farm_water {slot:30} 返回 ok:true，水 100→99，并把 td[30]=2、tk[30]=2；随后 shop_buy_item 买种子，farm_plant_seed {slot:30,item_id:5000} 返回 ok:true，tu_di_zhong_zhi[30]="5000"、zuo_wu_sheng_zhang[30]=1789785625、td[30]=3。只读代码对照：farm_water 分支直接 applyManageItemToRow 扣水后写 td[sk]=2/tk[sk]=2，全程无 td/tk 前置校验；farm_plant_seed 同样未校验开垦状态。影响：玩家（或脚本）可绕过开垦成本与等级上限，在任意 0..80 未开垦地块浇水播种，与 farm_land_expand 的 level_too_low/already_expanded 限制形成不一致。相关原始输出：raw/e4_water_slot30.out、raw/e4_plant_slot30.out。
