---
date: "2026-09-19T06:41:13.638Z"
symptom: "半亩芳华：公会后院与个人种植系统规则不一致（靠浇水次数升级、只有虫灾、收获对所有人开放），且文字版完全没有后院入口；文字版公会面板的 guild_info 动作在服务端未实现。"
component: "banmu-server/game_actions.js（公会后院）"
severity: "major"
status: "fixed"
root_cause: "公会后院是早期独立实现的玩法（浇水次数驱动成长、仅虫灾、收获全员开放），与后来成熟的个人种植系统（时间驱动、双灾害、冻结语义）走了两套规则，且缺少\"会长指定职位\"这一权限层级。"
fix: "game_actions.js 重写公会后院 7 个动作（时间驱动 + 双灾害 + 冻结语义 + 权限模型 + 旧数据迁移），新增 guild_backyard_set_roles 与 guild_info；index.vue 新增公会标签页后院面板。已部署验证。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-admin/web/src/views/logic/index.vue"
---

背景：用户要求"公会功能栏添加公会后院，功能和种植系统一致"，并明确权限——灾难处理由所有公会成员进行、种植与收获由会长 + 会长指定职位执行；同时裁决灾难规则（灾害期间停止生长、处理完继续、不额外补时长；处理干旱扣 1 水、处理虫灾扣道具）。核查发现旧后院与种植系统完全是两套规则：6 格、靠浇水次数累积升阶段（20 次浇水升 1 级、共 5 级）、只有虫灾（升阶段 25% 概率）、收获对全体成员开放。重构落地：①数据模型改为时间驱动 {seed_id, crop_id, plant_time, growth_sec, stage_confirmed, disaster}，生长时长取自服务端品级时长表（与农场同源），删除 stage/water/water_needed/fertile；②双灾害且与农场一致，任何成员读取或操作后院时惰性推进阶段（阈值 0.3/0.7/1.0，与客户端 plant_entity 相同），跨阶段且未成熟时按 calcDisasterChance 掷灾，灾难期间停止生长；③处理代价：浇水耗 1 水、除虫耗 1 个杀虫剂，处理后 plant_time += hang；④新增 guild_backyard_set_roles（仅花主），can_manage = 花主 ∨ 角色∈manage_roles，种植/收获据此校验，浇水/除虫不限制；⑤新增 _backyardMigrateCells 迁移存量旧格（plant_time←planted_at、growth_sec←品级时长、bug→disaster(pest)、清理旧字段），惰性随 _backyardPrep 执行，避免"永远生长中 0%、无法收获"的僵尸格；fertilize 按"与种植系统一致"移除；⑥文字版公会标签页新增公会后院面板，数据全部来自 guild_info，前端不自行推导进度/成熟。同时发现并修复：文字版调用的 guild_info 在服务端根本没有实现（点击必返回 unknown_guild_action），已补齐并作为后院数据源。线上验证：旧格迁移后进度 100%/可收获、残留旧字段 0；花匠默认 can_manage=false 且种植收获均 no_permission，花主 set_roles 后放行；种 3 格后跨 70% 阶段掷出干旱，触发后进度冻结、收获被 disaster_pending 拦截，处理后（水 6642→6641）恢复可收获；6 格最终清空。教训：多人共用地块的状态推进必须幂等且可被任意成员触发（惰性 tick + 阶段去重），派生状态应由服务端算好下发。
