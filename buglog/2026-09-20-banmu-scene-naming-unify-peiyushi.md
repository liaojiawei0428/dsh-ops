---
date: "2026-09-20T02:03:07.042Z"
symptom: "半亩芳华：同一个图鉴精炼功能场所在不同界面显示为\"铁匠铺\"\"精炼室\"\"培育室\"三种名字，玩家无法建立稳定认知。"
component: "banmu-admin/web + banmu-server（场景命名）"
severity: "minor"
status: "fixed"
root_cause: "SC-20 场景按世界观设计为\"铁匠铺\"却被用作图鉴精炼功能入口，之后又引入\"培育室\"概念，三套命名（铁匠铺/精炼室/培育室）分别沿用在数据、UI 与提示文案中，缺少统一命名口径。"
fix: "文字版 UI、后台注释、游戏服提示、场景源数据（scenes_export.json / seed_story_scenes_all.js）与线上 scenes 表全部统一为「培育室」，并把 SC-20 的 desc 修正为「植物培育/图鉴升品」。已部署验证。"
related_files:
  - "banmu-admin/web/src/views/logic/index.vue"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-server/game_actions.js"
  - "banmu-server/data/scenes_export.json"
---

用户要求"把所有精炼室的名称改成培育室，统一培育室起来"。排查发现承担"图鉴精炼（升品）"功能的 SC-20 场景在玩家可见处有三种称呼：scenes 表的 name 是「铁匠铺」、文字版入口按钮与弹窗标题是「精炼室 · 铁匠铺」、系统别处（动作名/培育位）又叫「培育室」。根因：该场所最初按世界观设计为铁匠铺（desc=工具/护店/重建、剧情 H0401 招牌、NPC 赵铁柱），实现时被用作图鉴精炼入口（fun=refine），之后又引入培育室概念，三套命名各自沿用。改名前的安全性核查：检索 quest_defs 全部任务，确认"铁匠铺"出现 0 次，H0401「新招牌」的 description 与对白只提到 NPC 赵铁柱与招牌，不依赖场景名，因此改名不会破坏剧情文本。解决（区分场所名与动作名，只统一场所名）：①index.vue 入口按钮改"进入培育室"、弹窗标题改"培育室"、材料清单与询问提示改为培育室口径；②logic.service.ts 场景功能标记注释同步；③game_actions.js 两处玩家可见提示改培育室；④scenes_export.json 与 seed_story_scenes_all.js 的 SC-20 name→培育室，并把与实际功能不符的 desc「工具/护店/重建」改为「植物培育/图鉴升品」；⑤线上 scenes 表 UPDATE 同步（该表是文字版与客户端场景列表的权威来源）。动作词"精炼"（tu_jian_refine 等契约标识与玩法动作名）保持不变。验证：/logic/view 返回 SC-20|培育室|植物培育/图鉴升品|fun=refine，场景列表无旧称；线上前端产物含新文案且"精炼室""铁匠铺"命中数为 0；scenes 表 LIKE 检索旧称匹配 0 行；双服务健康。教训：改名须区分场所名与代码标识；场景名是跨端共享数据，必须同时改源数据文件与线上表；改名前列出目标词是否被剧情/任务文本依赖。
