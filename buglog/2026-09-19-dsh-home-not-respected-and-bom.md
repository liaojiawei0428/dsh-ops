---
date: "2026-09-19T07:30:12.786Z"
symptom: "隔离演练（DSH_HOME 指向临时目录）时，update-dsh.ps1 仍读写真实 %USERPROFILE%\\.dsh 的凭据检查与 backups 目录，health-check.py 也固定体检 ~/.dsh；另有 5 个核心 .ps1 缺 UTF-8 BOM，落到 PowerShell 5.1 会因中文按 GBK 解析而语法错误"
component: "health-check.py"
severity: "minor"
status: "fixed"
root_cause: "update-dsh.ps1 有 5 处硬编码 $env:USERPROFILE\\.dsh（凭据、备份、profile 预检），health-check.py:35 硬编码 Path.home()/\".dsh\"；而 bootstrap/watchdog/validate-plugins/personal-hub 都尊重 DSH_HOME。BOM 缺失是历史编辑工具剥离所致（PLUGIN-STANDARD D5 与 AGENTS.md 准则 5 要求 .ps1 恒为 UTF-8 带 BOM）。"
fix: "update-dsh.ps1 引入 $dshHome = $env:DSH_HOME（空则回退 ~/.dsh）并替换 5 处引用；health-check.py 引入 DSH_HOME/OVERLAY_CFG 常量并替换 PROF_PKG；bootstrap-personal.ps1、start-dsh-web.ps1、update-dsh.ps1、sync-official.ps1、check-update.ps1、watchdog-dsh.ps1 统一补回 UTF-8 BOM（编辑结束后一次性补，避免被后续编辑再次剥离）。"
related_files:
  - "DSH-ops/update-dsh.ps1"
  - "DSH-ops/health-check.py"
  - "DSH-ops/bootstrap-personal.ps1"
  - "DSH-ops/start-dsh-web.ps1"
  - "DSH-ops/sync-official.ps1"
  - "DSH-ops/check-update.ps1"
  - "DSH-ops/watchdog-dsh.ps1"
---

发现路径：B 脚本扫描 INCONSISTENT（DSH_HOME 不尊重 + BOM）+ D 对抗验证 C5/C6。验证：全部 DSH-ops 根目录 .ps1 复查 BOM=YES（9 个）；6 个改动脚本 PowerShell AST 解析 0 错误；health-check.py 改后实跑 —— 新增「机器覆盖层」段输出「结构正常（extraPatches 1 · extraDependencies 2 · plugins 覆盖 1）」，全程 HEALTH 全绿、exit 0。注意：health-check.py 仍会对真实服务做端口/看门狗检查，DSH_HOME 只影响它读哪个 profile 与覆盖层。
