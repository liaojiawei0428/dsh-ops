---
date: "2026-09-19T07:30:12.524Z"
symptom: "新电脑按 DEPLOY.md 部署后，「更新DSH.bat」/update-dsh.ps1 与 sync-official.ps1 立即失败（update-dsh 打印「错误: 未找到仓库 …」exit 1），升级链 100% 不可用；check-update.ps1 还把「目录不存在」误报成「VPN 节点失效」，每次启动都提示"
component: "update-dsh.ps1"
severity: "major"
status: "fixed"
root_cause: "update-dsh.ps1:8 / sync-official.ps1:37 / check-update.ps1:6 都用 Split-Path $ops -Parent 定位官方 checkout（<DSH-ops 父目录>\\Deepseek_DSH，平级），而 bootstrap-personal.ps1 只把官方源码 clone 到仓库内部副本 <repo>\\Deepseek_DSH，从不创建那个平级目录；DEPLOY.md 也从未给出创建步骤。开发机之所以能用，是因为该平级目录是历史遗留。"
fix: "三处一起修：① bootstrap-personal.ps1 新增第 1b 步，自动 clone 平级官方 checkout（--depth 1，失败即 throw）；② update-dsh.ps1 在平级 checkout 缺失时自动 clone 后再继续（失败给出可照抄的手工命令）；③ sync-official.ps1 非 -ApplyPatchesOnly 分支同样自动补 clone；④ check-update.ps1 在 fetch 之前先判目录存在性，缺失时打印准确路径与创建方法并 exit 0（不再误报代理/VPN）。DEPLOY.md 架构速览与第 2 步同步说明「两个 Deepseek_DSH 缺一不可」。"
related_files:
  - "DSH-ops/bootstrap-personal.ps1"
  - "DSH-ops/update-dsh.ps1"
  - "DSH-ops/sync-official.ps1"
  - "DSH-ops/check-update.ps1"
  - "DSH-ops/DEPLOY.md"
---

发现路径：团队审核三路独立命中（B 脚本扫描 BLOCKER-1、A 文档 BLOCKER-B2、D 对抗验证 A1 并给证据行）。证据：update-dsh.ps1:8 `$repo = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'`、:18-21 缺失即 exit 1（无 clone 兜底）；bootstrap 只 clone 到 $copy=<repo>\Deepseek_DSH。验证：改后 6 个 .ps1 全部通过 PowerShell AST 语法解析、UTF-8 BOM 齐备，未引入新的 powershell.exe 调用；health-check 全绿。残余：平级 checkout 的自动 clone 未在真实新机上跑过（本机该目录已存在，走的是「已存在，跳过」分支）。
