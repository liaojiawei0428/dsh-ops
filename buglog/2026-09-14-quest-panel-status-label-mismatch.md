---
date: "2026-09-14T08:40:55.833Z"
symptom: "任务面板未解锁任务不显示、可领取标签无领取按钮、已领标签语义混淆"
component: "banmu-admin/web/src/views/logic/index.vue"
severity: "major"
status: "fixed"
root_cause: "任务面板仅按 active/completed/claimed 三组渲染导致 locked 被静默丢弃；completed 按钮二选一使标签与实际操作项不一致；弹窗引用快照对象导致刷新后状态不更新。"
fix: "补「未解锁」分组与解锁条件、completed 行补领取按钮、claimed 标签精确化、弹窗改实时状态对象、统计四项、场景弹窗同步标签。"
related_files:
  - "banmu-admin/web/src/views/logic/index.vue"
---

用户要求核对文字版游戏领取/完成任务相关按钮与标签是否对应。核对出 6 处不对应：①locked 任务无归属分组被静默隐藏（玩家看不到未解锁任务与条件）；②completed 行标签「可领取奖励」但有剧情时按钮仅「查看剧情」、无领取入口（v-if 有剧情/v-else 领取奖励二选一）；③claimed 标签「已完成」与 completed 语义混淆；④剧情弹窗引用打开时快照对象，领取后状态/按钮不刷新；⑤顶部统计缺未解锁计数；⑥场景弹窗 claimed 显示「已完成」、locked 无解锁条件提示。修复：新增「未解锁」折叠分组（el-collapse，含 questLockReason：等级门槛+前置任务文案）；completed 行同时提供查看剧情（若有）+领取奖励按钮；claimed 统一「已领取奖励/已领取」；弹窗改用 dialogStoryLive（按 quest_id 取 questList 实时行）；顶部统计改四项；场景弹窗同步「待领取·看完下方剧情后可领取/进行中/已领取/未解锁+条件」。验证：线上 888 状态 active6/completed1/claimed9/locked103、未知状态 0（四组全覆盖）；E0102 领取闭环 completed→claimed 奖励消息「获得铜钱x30、获得经验+150」正确；线上产物含新文案、旧「已完成（」无残留。
