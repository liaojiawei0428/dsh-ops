---
date: "2026-09-16T03:14:25.638Z"
symptom: "场景布局迁移 SQL 在 MySQL 5.7 上执行失败（ERROR 1064 near 'IF NOT EXISTS map_seq'），scenes 表 map_* 列未创建，后续查询报 Unknown column 'map_w'，世界网格不显示任何场景。"
component: "banmu-admin/deploy/world_scene_layout.sql"
severity: "major"
status: "fixed"
root_cause: "生产库是 MySQL 5.7.18-cynos（腾讯云 CynosDB），不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS 语法（MariaDB 10.0+/MySQL 8.0+ 才有），迁移脚本误用了该写法。"
fix: "SQL 文件移除 ADD COLUMN IF NOT EXISTS，只保留幂等 UPDATE；列创建改由部署脚本查 information_schema 后按需执行标准 ALTER TABLE ADD COLUMN（兼容 MySQL 5.7 且可重复执行）。"
related_files:
  - "banmu-admin/deploy/world_scene_layout.sql"
  - "banmu-admin/deploy/deploy_scene_grid.py"
  - "BUGS.md"
---

场景地标网格化需要给 scenes 表新增 map_seq/map_x/map_y/map_w/map_h 五列并写入 24 行布局值。首版迁移脚本按 MariaDB 习惯写成：

ALTER TABLE scenes ADD COLUMN IF NOT EXISTS map_seq INT NOT NULL DEFAULT 0 COMMENT '...', ... ;

执行报 `ERROR 1064 (42000) at line 5: You have an error in your SQL syntax ... near 'IF NOT EXISTS map_seq INT NOT NULL DEFAULT 0'`，五列未创建；紧接着的校验查询报 `ERROR 1054 Unknown column 'map_w' in 'field list'`。若未察觉继续部署，后台 buildWorld 会因查询 map_* 抛错（已被 `.catch(() => [])` 兜底为无场景，但表现为网格上不显示任何场景）。

根因：生产库为 **MySQL 5.7.18-cynos-2.1.14-log**（腾讯云 CynosDB），不支持 `ADD COLUMN IF NOT EXISTS`（该语法仅 MariaDB 10.0+/MySQL 8.0+ 提供）。项目脚本目录里此前既有 MariaDB 风格写法，容易误用。

修复：
1. `world_scene_layout.sql` 去掉 ALTER，只保留 24 条幂等 UPDATE 与末尾校验 SELECT（可重复执行）。
2. 列创建迁移到部署脚本：先 `SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='banmufanghua' AND TABLE_NAME='scenes' AND COLUMN_NAME IN (...)`，计数 <5 才执行标准 `ALTER TABLE scenes ADD COLUMN ...`（五个独立 ADD COLUMN 子句），≥5 则跳过。

验证：重跑输出 `rows_cnt=24 cells=585 min_x=0 max_x=178 max_y=7`；admin `/api/admin/logic/view` 返回 `scenes=24 scene_cells=585`，SC-01 锚点 (5,3) 占 24 格、SC-24 锚点 (178,1) 占 8 格；后续重复执行脚本不再报错（幂等）。

教训：写迁移前先 `SELECT VERSION()` 确认目标库类型与版本；MySQL 5.7 与 MariaDB/MySQL 8 在 DDL 语法（IF NOT EXISTS）、JSON 函数、窗口函数上差异明显，本项目生产库是 MySQL 5.7。
