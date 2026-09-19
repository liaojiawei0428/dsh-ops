---
date: "2026-09-19T07:22:22.814Z"
symptom: "对已打过补丁的官方副本再次运行 official-patches/apply-patches.mjs，不是纯 no-op 也不是纯 fail-loud：6 条 append/prepend 型补丁会重复插入同一段代码/文档（静默重复），其余 11 条报 count=0 失败，脚本最终 exit 1，但源码已被二次改坏"
component: "official-patches/apply-patches.mjs"
severity: "major"
status: "open"
root_cause: "幂等判据是「old 目标串在文件中出现次数必须恰好为 1」（apply-patches.mjs:180-184）。但 17 条补丁里有 6 条（#7/#9/#10/#12/#14/#17）的 new 文本以 old 文本为前缀（追加型：new = old + 新增内容），应用一次后 old 仍然存在且计数仍为 1，脚本无法区分「未打」与「已打」，于是再次执行替换相当于再追加一份。replace 型补丁（old 不在 new 中）二次执行时 old 计数变 0，才会 fail-loud"
fix: "待修（未改代码）。建议二选一：① 对 old 是 new 子串的补丁增加已应用探针（例如同时要求 new 中 old 之后的新增标记出现 0 次才允许写入）；② 补丁应用后写入 machine-readable 指纹（如 .patch-state.json 或源码内 marker 注释），apply 前先校验指纹。临时绕过：apply-patches.mjs 只在 clone 后或 sync-official 恢复官方源码后运行一次，禁止重复执行"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\adapter.ts"
  - "E:\\DSH\\DSH-ops\\bootstrap-personal.ps1"
  - "E:\\DSH\\DSH-ops\\sync-official.ps1"
dsh_commit: "05e2dda00dd695014ed1f30c2518395c71bc22bd"
---

只读实证（未真跑二次打补丁）：\n1) 从 apply-patches.mjs 截取纯数据段（`const patches = [` 到 `const failures`）导出 17 条补丁到 _sandbox/patches-extracted.json。\n2) 对每条计算 new.count(old)：6 条结果为 1（old ⊆ new），11 条为 0（replace 型）。\n3) 交叉验证运行副本 E:\\DSH\\DSH-ops\\Deepseek_DSH：这 6 条 old 计数恰为 1，且其 new 中「不属于 old 的新增长行」在副本里也恰出现 1 次（例：adapter.ts:372-377 有 sessionId 三行块，探针计数=1）→ 证明这些文件确实已应用过一次，old 因是前缀而残留。\n4) 官方纯净 checkout E:\\DSH\\Deepseek_DSH（commit ddefc45，2026-09-17 21:19）17 条 old 全部恰好 1 次 → 首次应用全部成功，说明该仓库状态健康，风险只在「重复执行」。\n5) 触发场景真实存在：bootstrap-personal.ps1:40-46 的 clone 有「副本已存在则跳过」分支，第 60 行 apply-patches 却无条件执行；sync-official.ps1 若未完整恢复官方源码就重跑，同样会踩到。
