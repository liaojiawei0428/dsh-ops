---
date: "2026-09-19T02:43:56.908Z"
symptom: "新玩家首次 GET /api/load_data/<openid> 返回 HTTP 500，响应体为纯文本 \"error\"，玩家永远无法建档进入游戏（线上实测 openid=qa_probe_785484）"
component: "banmu-server/fuwuqi.js（/load_data 新号建档）"
severity: "critical"
status: "open"
root_cause: "banmu-server/fuwuqi.js 的 /load_data/:openid 路由在 rows.length===0 分支执行 INSERT INTO players (id, huo_bi, ...)，但 players 表主键列名是 yong_hu_id，不存在 id 列；MySQL 抛 \"Unknown column 'id' in 'field list'\"，被 catch 后 res.status(500).send('error')。实测把列名改为 yong_hu_id 后同一 INSERT 立即成功。附带：scene_current 为 NOT NULL 且无默认值，而该 INSERT 未提供该列，在 STRICT_TRANS_TABLES 下是第二处潜在阻塞点。"
fix: "尚未修复（本次任务禁止修改服务端代码，仅实测取证）。修复方案：把 INSERT 列名 id 改为 yong_hu_id，并在 INSERT 中补 scene_current 的默认值（或给该列加默认值）。证据与完整 SQL 见 .workbuddy/qa/probe/evidence.md §2 与 raw/e1_log_grep.out。"
related_files:
  - "/www/wwwroot/sparrow-logic/banmu-server/fuwuqi.js"
  - ".workbuddy/qa/probe/evidence.md"
  - ".workbuddy/qa/probe/raw/e1_log_grep.out"
---

调查过程：E1 用临时号 qa_probe_785484 调 GET load_data → body "error"。对照 test_user_888 返回完整 JSON，排除路由不存在。读 fuwuqi.js:990 的 load_data 路由，看到 else 分支 res.status(500).send('error')；再 grep 到 INSERT INTO players 在 fuwuqi.js:1113。服务日志 server_stdout.txt:8600-8603 给出确切错误 "读取失败-玩家标识-qa_probe_785484-原因-Unknown-column-'id'-in-'field-list'-15ms"。DESCRIBE players 确认首列为 yong_hu_id varchar(128) PRI，无 id 列。反证：手工用列名 yong_hu_id 执行同语义 INSERT 成功（players 行数 2→3），证明列名是唯一阻塞点。该缺陷使所有真实新玩家无法首次建档，属阻断级。
