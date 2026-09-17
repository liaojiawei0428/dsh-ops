---
date: "2026-09-17T02:26:07.289Z"
symptom: "personal_hub_status 报漂移「patch 条目 opencode-session-id config.providers 不在清单中」；personal_hub_reapply 会静默删除该 providers: [] 覆盖（opencode 自定义路由将重新 400 MissingSessionID），且每次重建都在首块前多输出一份注释（不收敛）。"
component: "dsh-personal-hub"
severity: "major"
status: "fixed"
root_cause: "两层缺陷叠加：(1) renderManagedBlock 只渲染单引号标量 `${key}: '${String(value)}'`，数组会被写成字符串 '[]'（破坏数组型插件 config），因此 `providers: []` 无法进清单、只能手写进 live cordis.patch.yml；reapply 的 rebuildPatchYaml 以「清单 patch 字段」为准重建托管块，清单没有 config → 该覆盖被静默删除。比对端 statusReport 用 String(value) 规范化（String([]) === ''），即便把数组补进清单也会误报漂移，故两端必须同时改。(2) parsePatchBlocks 的 headEnd 只推进到第一个 `- id:` 之前、未回退紧邻的注释行，首块注释既留在 header 又被托管块输出一次 → 每轮 reapply 净增一行注释。"
fix: "renderConfigValue/configValueText 一对镜像函数让渲染端与比对端支持非标量 config；parsePatchBlocks 把紧邻首个 `- id:` 的注释回退给首块（消除注释累积回归）；renderManagedBlock 支持多行 comment；personal.json 补 config.providers=[]。真跑 reapply 后 profile 文件与改前逐字节一致。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
---

承接同日 open 记录 2026-09-17-personal-hub-status-patch-opencode-sessi.md（根因定位），本条为修复与验收。

改动（plugins/dsh-personal-hub/index.js + personal-hub/personal.json）：

1) 新增 renderConfigValue：字符串保持历史单引号标量，其余类型走 JSON.stringify（数组/对象/数字/布尔都是合法 YAML flow 语法）。renderManagedBlock 改用它输出 config，于是清单终于能声明 `providers: []`，渲染为真正的 YAML 空数组而非字符串 '[]'。

2) 新增镜像函数 configValueText（字符串原样、其余 JSON.stringify），statusReport 的比对从 `String(value)` 改用它 —— 否则 String([]) === '' 会让数组 config 永远误报漂移。

3) parsePatchBlocks：header 定位改为「先找第一个 `- id:` 得到 firstId，再向前回退紧邻的连续 `#` 行作为首块 preamble（headEnd）」，pending 初始化为 lines.slice(headEnd, firstId)。这修掉 2026-09-09 把 header 从「首个空行」改成「第一个 - id:」时引入的回归：当时首块注释被留在 header，重建时 header 原样输出 + 托管块再输出一份 → 每轮 reapply 净增一行注释（正是 2026-08-28 已修过的累积问题）。同步更新函数 JSDoc（原文写「everything before the first blank line」，与实际实现早已不符）。

4) renderManagedBlock 支持多行 comment（每行加 `# ` 前缀），使清单能承载完整说明。

5) personal.json 的 dsh-opencode-session-id 补 `"config": { "providers": [] }`，并把 live 里原本手工存在的两行说明合并进 comment 字段 —— 该覆盖从此由清单托管，reapply 不再丢。

验收证据：

- 只读重建（抽取真源码函数 + 按 personal.local.json 语义合并清单，对 live 文件重建且不写盘）：providers 覆盖保留、未退化为 '[]'、deepseek-balance 注释仅出现 1 次、二次重建结果完全相同（幂等）、全部托管 id 在、重建后与清单零漂移。
- 重启后 personal_hub_status：「无漂移：清单 10 个插件 + 6 条 patch 覆盖」。
- 真跑 personal_hub_reapply（2026-09-17T02-25-39-019Z-personal-hub 备份）：全部步骤成功 + 复检无漂移；reapply 后 cordis.patch.yml sha256[:16]=666da5dc3c390450、package.json sha256[:16]=5cd587377bb7cbf8，与 reapply 前**逐字节一致**（幂等不动点）；备份目录含 cordis.patch.yml / cordis.yml / package.json，备份内的 patch 哈希等于基线。
- health-check 全绿（服务 pid 48008、看门狗在岗、12 bundles、闸门 10/10、回归 T1–T4）。
