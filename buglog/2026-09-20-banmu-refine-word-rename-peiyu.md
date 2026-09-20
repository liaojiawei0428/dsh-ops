---
date: "2026-09-20T02:10:49.826Z"
symptom: "半亩芳华：场所已叫\"培育室\"，动作词却仍是\"精炼\"（出现\"培育室会指定一份精炼材料清单\"这类混搭），且剧情设计文档仍写\"SC-20 铁匠铺\"。"
component: "banmu（命名统一：精炼→培育）"
severity: "minor"
status: "fixed"
root_cause: "该功能经历三轮命名演进（铁匠铺→精炼室→培育室），每轮只改了当次涉及的文案层，动作词（精炼）与设计文档未一起收敛，导致场所名与动作词混搭、文档与线上不一致。"
fix: "11 个代码/数据/文档文件的 78 处中文\"精炼\"统一为\"培育\"；线上 shop_items 与 item_defs 描述同步（REPLACE）；剧情设计 01/08/11A 同步并修正语义错位；代码标识与资源路径保持不变。已部署验证。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-admin/web/src/views/logic/index.vue"
  - "banmu-server/migrations/005_flower_shop_refine.sql"
  - "剧情设计/08_全局场景设计.md"
  - "剧情设计/01_核心NPC设定_2_市井与温情.md"
---

用户在前一轮统一场所名（精炼室/铁匠铺→培育室）后追加要求："动作词精炼也要改成培育"、"剧情设计文档要同步"。执行前先做全局统计：中文"精炼"共出现在 14 个文件、125 次，需按性质分流——①代码文案与注释（game_actions.js 27、index.vue 22、logic.service.ts 2、quests.vue 1、quest_engine.js 1、sysmsg.js 1、客户端 jing_lian_shi.gd 2 与 ui_manager.gd 1）；②SQL 迁移中的种子数据描述（005 13 处、006 4 处）；③进度表 3 处；④changjing_manifest.json 16 处但实为纹理资源路径（res://changjing_zichan/UI_anjian/精炼1.png），改名会导致资源丢失，故不改；⑤BUGS.md 32 处属历史档案，保持原貌不回溯改写。执行：11 个文件共 78 处"精炼"→"培育"；线上 shop_items(5 行) 与 item_defs(4 行) 用 REPLACE 更新描述（如"精炼材料：花瓣晨露凝晶"→"培育材料：花瓣晨露凝晶"、"一种用于精炼花卉的精华"→"一种用于培育花卉的精华"）；剧情设计文档同步时发现一处语义错位——无差别把"铁匠铺"替换为"培育室"后出现"镇上培育室掌柜"，而赵铁柱的设定是铁匠（打铁三十载、围裙火星洞、农具招牌出自他手），SC-20 的布景也是"火炉、铁砧、火星"，说明该场景是"设计为铁匠铺、实现为培育室"的错位；修正为 NPC 身份写"镇上铁匠（铺面即 SC-20 培育室）"、场景标题写"SC-20 培育室（原设计为铁匠铺）★工具与护店 / 图鉴培育"并补注布景沿用铁匠铺设定。代码标识（tu_jian_refine、jing_lian_xu_qiu、fun='refine'）一律未动。验证：前端产物含"进入培育室/培育需求"且"精炼""铁匠铺"命中数为 0；/logic/view 返回 SC-20|培育室|植物培育/图鉴升品；DB 两个表残留 0；三个 JS 远端语法通过、宝塔重启 SUCCESS；双服务健康。
