---
date: "2026-09-19T03:31:05.381Z"
symptom: "半亩芳华文字版：生长时长/成熟时间由前端硬编码的品级表计算，与服务端配置重复；一旦服务端调整品级时长，文字版显示与实际判定不一致。"
component: "banmu-admin/web（文字版生长时长）"
severity: "major"
status: "fixed"
root_cause: "生长总时长没有随存档下发，前端只能用自己维护的品级常量表兜底；该兜底在所有\"播种时未写 sec: 段\"的地块上都会生效，因而实际承担了主数据源角色，与服务端配置重复且可能漂移。"
fix: "game_actions.js 导出 loadSeedGrowthCache；fuwuqi.js 的 load_data 下发 seed_growth_sec；logic.service.ts 的 buildGrid 用该表填充 crop_growth_sec。已部署验证（100 条目下发成功）。"
related_files:
  - "banmu-server/game_actions.js"
  - "banmu-server/fuwuqi.js"
  - "banmu-admin/server/src/modules/logic/logic.service.ts"
  - "banmu-admin/web/src/views/logic/index.vue"
---

发现过程：方向调整为"文字版与服务端对齐"后，做了一次数据面"双份定义"扫描（提取前端常量表并与服务端配置比对），发现 4 处重复定义，其中生长时长有实际影响。文字版 index.vue 硬编码 GRADE_MIN/GRADE_SEC（凡1/精5/珍100/仙1000/绝5000 分钟），与服务端 game_actions.js 的 GRADE_GROWTH_MIN 完全一致但独立维护。影响：服务端调整品级时长后，文字版仍按旧值渲染成熟时间与进度百分比，会产生"界面显示已成熟、点收获被 not_mature 拒绝"的同类矛盾（与已修的 elapsed 冻结问题同源）。根因：生长总时长没有随存档下发，前端只能用本地副本兜底（crop_growth_sec || cropTotalSec(cropId)），兜底因此从"异常保护"变成了"常态数据源"。修复：game_actions.js 导出既有缓存函数 loadSeedGrowthCache；fuwuqi.js 的 load_data 下发 seed_growth_sec（种子→秒，实测 100 条）；logic.service.ts 的 buildGrid 用它补齐未写 sec: 段的地块，形成三级优先：播种写入的 sec: 段 &gt; 服务端品级表 &gt; 前端本地表（仅极端兜底）。验证：线上 load_data 返回 seed_growth_sec 100 条（5000→60 秒等）。教训：前端兜底常量与服务端权威配置重复定义同一业务量时，兜底迟早变成主数据源；应让权威值随数据下发。
