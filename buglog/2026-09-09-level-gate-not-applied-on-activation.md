---
date: "2026-09-09T09:38:42.413Z"
symptom: "等级未达的任务仍可激活并查看剧情对话"
component: "banmu-server/quest_engine.js + admin 投影"
severity: "major"
status: "fixed"
root_cause: "等级校验只在领取环节，激活路径（补偿解锁/场景激活/锁钥解锁/剧情 next）与投影未查等级，未达等级任务被激活。"
fix: "状态机激活路径全部加等级闸 + ensureQuestProgress 历史兜底 + admin 投影等级锁定 + 升级自动解锁。"
related_files:
  - "banmu-server/quest_engine.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
---

用户反馈：等级未达到的任务仍可激活并对话（需求：等级未达应不可激活/不可对话/不可领取）。根因：trigger.level 只在 claimQuest 领取时校验；任务状态机全部激活路径（ensureQuestProgress 补偿解锁、_activateByScene 场景激活两路径、claimQuest 锁钥解锁、recordChoice next 激活）与 admin 状态投影（logic.service quest_status）均未检查等级。修复：quest_engine 新增 _levelRequired/_passLevelGate，四处激活路径全部加等级闸；ensureQuestProgress 兜底把未达等级且未领取的 active 实例强制 locked（纠正历史残留）；升级后通过 activateTujianOnLevelUp 内校准自动解锁达标任务；admin 投影 questLockedByLevel 强制 locked（claimed 历史保留），补偿解锁同样受等级约束。验证：888（6级）view 中 H0111(7)/H0201(8)/H0301(15)/H0419(28) 全为 locked（无 active 且等级不足项）；到达 SC-11 场景 H0111 仍 locked（场景激活不越级）；E0101（1级）completed 正常。
