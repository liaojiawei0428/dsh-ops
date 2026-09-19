---
date: "2026-09-19T09:20:30.657Z"
symptom: "bootstrap 前置检查打印了「前置条件不满足…」的 fatal 列表，却没有以非零退出码结束（继续往下走）；同时 stderr 出现 \"You cannot call a method on a null-valued expression\"，且 pnpm 明明存在却被报成「未找到 pnpm」。"
component: "bootstrap-personal.ps1"
severity: "minor"
status: "fixed"
root_cause: "PowerShell 的一个类型转换陷阱：命令无输出时赋值得到的是 AutomationNull，`[string]` 转换它得到 `$null` 而非空字符串，于是紧随其后的 `.Trim()` 在空值上调用方法而抛错；叠加 `$ErrorActionPreference='Stop'` 使其成为终止性错误，脚本在诊断输出之后、退出码之前中断。自测阶段另有一个方法论坑：用 dot-source 执行被测算术块时 `exit` 不退出宿主，导致误判 exit 逻辑失效。"
fix: "bootstrap-personal.ps1 的 Test-CommandVersion：把 `([string]$raw).Trim()` 改为先判 `$null` 再字符串化（`if ($null -eq $raw) { '' } else { \"$raw\".Trim() }`），并在注释里写清 AutomationNull 的坑；node/pnpm 各加一条「命令存在但读不到版本」的独立 fatal 分支（提示手动运行 <tool> -v，并指出 %USERPROFILE%/%APPDATA% 为空这一常见原因）。验证：把前置块提取成文件、用 `pwsh -File` 跑 6 个场景，退出码与提示文案全部符合预期；T5 编码闸门与 test-standard 五项全绿。"
related_files:
  - "bootstrap-personal.ps1"
  - "DEPLOY.md"
  - "DEPLOY-COMPAT-REVIEW.md"
dsh_commit: "2c746842e4"
---

新增「第 0 步前置条件检查」时踩到两个坑，都属于"报错信息与真实原因不符"的类型：① `$raw = (& $Exe @VersionArgs 2>$null | Select-Object -First 1)` 在命令无输出时得到的是 AutomationNull，而 `[string]AutomationNull` 求值为 `$null`（不是空串），于是 `([string]$raw).Trim()` 抛 "You cannot call a method on a null-valued expression"；在 `$ErrorActionPreference='Stop'` 下这是终止性错误，会让整个脚本**在 `exit 1` 之前**中断——表现为"打印了 fatal 列表却没有以非零码退出"，排查时极易误判成 exit 逻辑写错。修法：先 `if ($null -eq $raw) { '' } else { "$raw".Trim() }`（AutomationNull 与 $null 相等比较为真）。② 触发条件很隐蔽：`%USERPROFILE%` 为空时 pnpm 自身会失败（它靠这些环境变量定位 store/缓存），于是"命令存在但读不到版本"，原代码却报"未找到 pnpm"——已改为区分「未找到」与「存在但读不到版本」两种 fatal，后者给出可操作提示。自测方法上的教训：我最初把代码块用 dot-source 方式跑，发现 exit 码始终为 0，一度以为 exit 失效；实测 `exit` 在 dot-source 的脚本里只退出该脚本作用域，而真实用法是 `pwsh -File`（那里 exit 正常传播，验证为 exit 7 → 7）。所以这类脚本的自测必须用 `pwsh -File` 跑成文件的副本，不能 dot-source。最终 6 个场景（真实环境 / PATH 无工具 / 版本不符 / 读不到版本 / DSH_HOME 已设 / USERPROFILE 为空）在 -File 模式下全部符合预期。
