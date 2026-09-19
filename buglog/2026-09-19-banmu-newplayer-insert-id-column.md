---
date: "2026-09-19T02:58:22.810Z"
symptom: "半亩芳华线上：任何新玩家调用 GET /api/load_data/&lt;openid&gt; 均返回 HTTP 500（body 仅 \"error\"），新号无法建档、进不了游戏；真实玩家 test_user_777 已在日志中留下失败记录且未入库。"
component: "banmu-server/fuwuqi.js"
severity: "critical"
status: "fixed"
root_cause: "players 表列名重构（id→yong_hu_id 等）时只改了读取路径，新建号 INSERT 的列清单漏改，仍写旧列名 id；而 yong_hu_id 是表中唯一 NOT NULL 且无默认值的列，导致 INSERT 必然抛错、被 catch 后返回 500。"
fix: "banmu-server/fuwuqi.js 新号 INSERT 首列 id 改为 yong_hu_id；DEPLOY.md §6 建表语句替换为线上真实 30 列结构并注明\"列名必须与 fuwuqi.js INSERT 严格一致\"。已部署并验证 HTTP 200。"
related_files:
  - "banmu-server/fuwuqi.js"
  - "DEPLOY.md"
---

调查过程：团队审核派出的线上实测员执行"新号建档形态"实验时，用全新 openid 调 GET /api/load_data/&lt;id&gt; 得到 HTTP 500 + body 仅为 "error"。排除参数与路由问题后抓服务端日志，得到 Unknown column 'id' in 'field list'。Lead 独立复核：①information_schema 确认 players 表 30 列中不存在名为 id 的列，主键是 yong_hu_id；②该表 NOT NULL 且无默认值的列只有 yong_hu_id；③日志中检索"新用户初始化"发现真实玩家 test_user_777 也走过同样失败路径，且该 ID 至今不在 players 表中，证明有真实受害者；④DEPLOY.md §6 建表语句仍是旧结构（id/huobi/xinxishuju…），说明是某次列名重构时漏改写入点。根因：表列名重构只改了读取点（SELECT/UPDATE 均用 yong_hu_id），新号 INSERT 仍是旧列名 id，而 yong_hu_id 无默认值 ⇒ INSERT 必然失败。修复：INSERT 首列改 yong_hu_id；同步重写 DEPLOY.md §6 为线上真实 30 列并加警告。验证：真机新建号返回 HTTP 200 且字段完整（land_cap=9/land_total=81/land_opened=9、tk/td 各 81 键）。附带纠正一处误判：曾被怀疑的第二阻塞点 scene_current NOT NULL 经复核确认有默认值，不是阻塞点。
