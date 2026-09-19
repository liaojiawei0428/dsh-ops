---
date: "2026-09-19T02:44:07.517Z"
symptom: "farm_disaster_recovery 传任意 mode 字符串（如 \"x\"）即返回 ok:true 免费解除干旱/虫灾且不消耗杀虫剂 2002，还照常获得恢复经验；只有 mode=\"bug\" 才校验道具"
component: "banmu-server/game_actions.js（farm_disaster_recovery）"
severity: "major"
status: "open"
root_cause: "game_actions.js 的 farm_disaster_recovery 分支仅对 mode === 'bug' 执行道具扣减校验（item_id 2002），其余 mode 值没有白名单判断，直接进入恢复逻辑：清灾害段、td[sk]=3、plantTime += (nowSec - eventTime)、addExperienceToLevelObject(GAMEPLAY_EXP_DISASTER_RECOVER)。"
fix: "尚未修复（只实测取证）。建议加 mode 白名单：只接受 'water'（解旱）与 'bug'（除虫），并按灾害类型匹配（dry→water、pest→bug），非法 mode 返回 bad_mode；或对每个 mode 都做对应道具/资源校验。"
related_files:
  - "/www/wwwroot/sparrow-logic/banmu-server/game_actions.js"
  - ".workbuddy/qa/probe/evidence.md"
  - ".workbuddy/qa/probe/raw/e7_mode_x.json"
  - ".workbuddy/qa/probe/raw/e7c_full.txt"
---

实测（临时号 qa_probe_785484，E7）：(1) 干旱态 tu_di_zhong_zhi[30]="5000|dry:1789785660"，调 farm_disaster_recovery {slot:30,mode:"x"} → ok:true，灾害段被清除（tz[30]="5000"），plantTime 由 1789785625 补偿为 1789785672（= plantTime + (now-at)），背包 2002 数量不变，经验 current_exp 0→6；(2) 对照组 pest 态 "5000|pest:1789785727" 用 mode:"bug" → ok:false code:insufficient_item（走扣 2002 杀虫剂分支，无道具即拒绝，灾害段保留）；(3) 同一 pest 态改用 mode:"x" → ok:true 免费解除，2002 不变，经验 6→12。只读代码对照：函数仅在 if (mode === 'bug') 内做 applyManageItemToRow(item_id:'2002', amount:-1)，无 else、无 mode 白名单校验，任何非 'bug' 字符串都直接执行恢复并加 GAMEPLAY_EXP_DISASTER_RECOVER 经验。原始输出：raw/e7_mode_x.json、raw/e7b_full.txt、raw/e7c_full.txt。
