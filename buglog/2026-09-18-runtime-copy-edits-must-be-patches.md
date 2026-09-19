---
date: "2026-09-18T01:11:49.508Z"
symptom: "在 E:\\DSH\\DSH-ops\\Deepseek_DSH（DSH 服务实际运行的官方源码副本）里直接修改源码并构建验证通过，但 git status 看不到任何改动；该修复会在下次 sync-official.ps1 / bootstrap-personal.ps1 时静默丢失。"
component: "official-patches"
severity: "major"
status: "fixed"
root_cause: "E:\\DSH\\DSH-ops\\Deepseek_DSH 是被 DSH-ops/.gitignore 忽略的\"官方源码副本（个人运行时）\"，由 sync-official.ps1 / bootstrap-personal.ps1 从官方 checkout 重新同步并仅重放 official-patches 的补丁；直接在其中编辑源码既不进版本控制，也会在下次同步重建时被覆盖。"
fix: "所有对官方源码的行为修改写入 E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs 的 patches 数组（精确替换，old 必须唯一），补丁文本用 python 从纯净官方 checkout 与运行时副本之间提取以免手工转义出错；提交前用临时目录 + filecmp 逐字节验证补丁能重现改动。本次已补入 7 条（llm-pi-ai 的 config.ts ×2、adapter.ts ×3、tests/adapter.spec.ts ×2）。注意 patch 机制只能替换已有文件内容，不能创建新文件，因此新增的 Agent Note（.agents/notes/implemented/feature/2026-09-17-*）无法补丁化，会随 sync 丢失——该类产物属于上游贡献。"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\.gitignore"
  - "E:\\DSH\\DSH-ops\\sync-official.ps1"
  - "E:\\DSH\\DSH-ops\\bootstrap-personal.ps1"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\adapter.ts"
---

发现过程：修完 llm-pi-ai 会话头并在 E:\DSH\DSH-ops\Deepseek_DSH 构建、重启、验证通过后，用 git status 核对改动清单时发现该目录下的文件一个都没出现在 git 状态里。追查：`git -C E:\DSH\DSH-ops\Deepseek_DSH rev-parse --show-toplevel` 返回 E:/DSH/DSH-ops，而 DSH-ops/.gitignore 明确写着：

    # 官方源码副本（个人运行时, 独立 node_modules + 补丁）——不入个人仓库
    # 新电脑部署: 运行 bootstrap-personal.ps1（clone 官方 → 应用补丁 → install → build）
    Deepseek_DSH/

即该目录是**运行时副本**，不是 git 跟踪的源码。另有一个带 .git 的官方 checkout 在 E:\DSH\Deepseek_DSH（纯净，未打补丁）。

这带来两个后果：(1) 直接改副本的修复会在下次 sync-official.ps1 / bootstrap-personal.ps1 重建时静默丢失；(2) 由于副本无 git，无法通过 git diff 审阅或提交这些改动。

正确机制：official-patches/apply-patches.mjs 的精确替换列表（每条 {file, why, old, new}，要求 old 在目标文件中恰好出现 1 次，否则 fail-loud 并阻止启动），由 sync-official.ps1 / bootstrap-personal.ps1 在每次同步后自动重放。既有 3 条补丁（rpc-host、session-format、web-search 会话头）都走这条路。

验证手法（本次建立，可复用）：利用 E:\DSH\Deepseek_DSH 是**未打补丁的纯净官方源**这一点，把要补的文件按相对路径复制到临时目录，对临时目录跑 apply-patches.mjs，再用 filecmp 与运行时副本逐字节比对。这在本次抓出了一个真 bug：两条 test 补丁的 new 漏写锚点原文，实际效果会删除原有测试；若只跑"补丁应用成功"而不比对内容，这个错误会一直潜伏到下次 sync 才炸。
