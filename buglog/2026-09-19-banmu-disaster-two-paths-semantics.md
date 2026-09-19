---
date: "2026-09-19T06:40:52.926Z"
symptom: "半亩芳华：同一场作物干旱，走\"浇水\"等于灾难毫无惩罚（时间照算），走\"解救干旱\"却会延后成熟且不消耗任何道具，两条路径规则互相矛盾。"
component: "banmu-server/game_actions.js（解灾语义）"
severity: "major"
status: "fixed"
root_cause: "干旱处理有两条独立实现的入口（farm_water 与 farm_disaster_recovery），一条只清灾难段不调播种基准（灾难无惩罚），另一条调整基准却不收代价（免费），缺乏统一语义与代价模型。"
fix: "game_actions.js：farm_water 补 plantTime+hang 并拦截虫灾；farm_disaster_recovery 的 water 分支扣 1 水并落库 huo_bi。已部署验证。"
related_files:
  - "banmu-server/game_actions.js"
---

发现过程：团队审核的对抗组在证伪时指出"两条解灾路径语义相反"，用户在后续会话中给出了权威规则。核实结果：同一场干旱有两条处理入口且结果完全不同——farm_water（客户端走这条）清除 dry 段但不调整播种基准 plantTime，导致灾难期间的时间被照常计入生长，等于干旱毫无惩罚；farm_disaster_recovery(mode=water)（文字版走这条）会做 plantTime+hang 使成熟延后（有惩罚），但不消耗任何道具还白拿 6 点恢复经验。玩家自然会选"更划算"的那条，规则形同虚设。根因：两条路径由不同时期实现，各自维护"清灾难段"与"是否计时"的逻辑，既无统一语义约定也无统一代价模型。用户规则：灾难期间植物停止生长、处理完才继续、处理灾难不额外补时长；处理干旱扣 1 滴水、处理虫灾扣对应道具。修复：①farm_water 清除干旱时补上 zw[sk] = plantTime + hang，与 disaster_recovery 完全一致；②disaster_recovery 的 water 分支新增扣 1 点水（此前免费）并把 huo_bi 加入落库字段；③farm_water 增加虫灾拦截（返回 wrong_disaster），避免玩家对虫灾地块白花 1 水。验证：线上干旱用 farm_water → 灾害段清除、水 99→98、plant_time 后移 12 秒（=灾难持续 12 秒）；虫灾用 mode=bug → 杀虫剂扣除、plant_time 后移 40 秒（=灾难持续 40 秒）。教训：同一业务结果存在多条入口时，必须显式约定权威语义并让所有入口收敛到同一实现。
