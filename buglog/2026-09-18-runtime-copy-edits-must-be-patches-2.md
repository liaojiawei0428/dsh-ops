---
date: "2026-09-18T02:11:06.786Z"
symptom: "官方自动更新后（0.1.6-alpha.1 → alpha.2），个人在运行副本新增的 Agent Note 三件套被 sync-official 直接删除，README 与 docs/config-catalog 的个人改动被官方版本覆盖，导致 verify-config-catalog 闸门失败、字段说明与决策记录消失；而代码补丁因自动重放而完好。"
component: "official-patches"
severity: "major"
status: "fixed"
root_cause: "sync-official.ps1 在同步官方源码后，会主动删除\"官方 checkout 中已不存在\"的残留文件。个人在运行副本里新建的文件（如 Agent Note 三件套）恰好命中这条规则，因为官方从来不存在这些路径；被官方同名文件覆盖的则是 README 与 docs/config-catalog。补丁机制原本只做精确文本替换，无法创建或保护新文件，因此个人文档与决策记录每次官方更新都会丢失——这与\"代码改动必须补丁化\"是同一根因的不同表现：**运行副本的一切个人内容都必须由 official-patches 重建，而不能依赖副本自身**。"
fix: "apply-patches.mjs 扩展 restore 机制（7 个个人文件始终从 official-patches/notes/ 覆盖恢复），README 说明改为 4 条精确替换补丁；恢复后重记 3 个双语一致性记录并重跑全部文档闸门（config-catalog、translation-pairing 1008 pairs、agent-note-format 467、doc-refs 3146 全绿）。个人 hub 清单同步移除 dsh-opencode-session-id 并 personal_hub_reapply 消除漂移。"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\official-patches\\notes"
  - "E:\\DSH\\DSH-ops\\sync-official.ps1"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
  - "E:\\DSH\\DSH-ops\\dsh-update.log"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\docs\\config-catalog.md"
---

补充发现（同日 alpha.2 自动更新实测）：

sync-official.ps1 在 robocopy 同步后有一道"删除官方 checkout 中不存在的残留文件"步骤。2026-09-18 的 0.1.6-alpha.1 → alpha.2 更新中，它删除了 60 个文件，日志明确列出（update-dsh.log）：

    官方 HEAD 跟踪文件: 12072 个, 删除 60 个官方已不存在的残留文件:
      ✓ .agents/notes/implemented/feature/2026-09-17-harness-session-header-route-opt-in.md
      ✓ ....zh.md
      ✓ ....i18n.yaml

即：**个人新增加的文件（不只是被编辑的文件）也会被删除**。同时被官方版本覆盖的还有 packages/llm/llm-pi-ai/README.md/.zh.md（字段说明）与 docs/config-catalog.md/.zh.md（生成物）。实测确认 AFTER: Agent Note 三件套 DELETED、README/catalog 的 harnessSessionHeader 计数归 0，而补丁落点的 src/tests/lib 全部 PRESENT。

直接后果：pnpm run verify-config-catalog 失败（docs/config-catalog.md is stale——src 有 harnessSessionHeader 而目录没有）。translation-pairing 与 agent-note-format 因两侧都是官方版本而暂时通过，但在恢复个人侧内容后会失配。

这次更新同时**反向验证了补丁机制有效**：10 条补丁（当时）在新版官方源上全部重放成功，与运行副本逐字节一致。

修复（已落地）：
1) apply-patches.mjs 从"只做精确替换"扩展为"替换 + 文件恢复"：新增 restore 列表（{from, to, why}，from 相对脚本目录 notes/，to 相对仓库根 = <target> 的父目录），始终覆盖写入，保证副本与 DSH-ops 一致；同步流程自动执行，无需改 .ps1。
2) official-patches/notes/ 存 7 个恢复源：Agent Note 三件套 + packages/llm/llm-pi-ai/README.i18n.yaml + docs/config-catalog.md/.zh.md/.i18n.yaml。
3) README 的字段说明改为 4 条精确替换补丁（英/中 × 表格/段落）。
4) 被删除的 Agent Note 三件套从会话日志（session.v3.jsonl.zstd 的 tool/call 参数）逐字提取还原；注意 write 之后若用 edit 追加过内容，日志里的 write 参数不含该增量，需另行补回（本次补回了 ## Related 节）。

验证手法：构造 <tmp>/packages 结构放入纯净官方源文件 → 跑 apply-patches.mjs <tmp>/packages → filecmp 对比运行副本。14 条替换 + 7 条恢复共 15 个文件全部逐字节一致。另外还抓到一个 python 提取 bug：ent.find(sub, i) 中 i 指向字段名而 sub 以两个空格开头，返回 -1 导致取到空块，把中文 config-catalog 插入了多余空行（已修正）。
