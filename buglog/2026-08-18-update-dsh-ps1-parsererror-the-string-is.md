---
date: "2026-08-18T06:43:29.322Z"
symptom: "update-dsh.ps1 试运行 ParserError \"The string is missing the terminator\"，中文日志全部乱码"
component: "dsh-ops-scripts"
severity: "major"
status: "fixed"
root_cause: "编辑工具写回时剥掉 .ps1 的 UTF-8 BOM，Windows PowerShell 5.1 无 BOM 按 GBK 解析中文，字符串字面量损坏导致 ParserError。"
fix: "用 UTF8Encoding($true) 重写补回 BOM；准则 D2/D5 强制 .ps1 带 BOM 且改后必检；启动链全部切换 pwsh.exe 7。"
related_files:
  - "D:/GongJu/DSH-ops/update-dsh.ps1"
  - "D:/GongJu/DSH-ops/AGENTS.md"
dsh_commit: "99f6f02fec"
---

编辑工具写回 update-dsh.ps1 时剥掉了 UTF-8 BOM；用户启动链（启动DSH.bat/更新DSH.bat）当时调用的是 powershell.exe（5.1），无 BOM 的 UTF-8 被按系统代码页 GBK 解析，中文字符串变乱码并破坏字符串字面量终止符，脚本 ParserError（"The string is missing the terminator"），端到端试运行 exit=1。排查：对比 start-dsh-web.ps1 与 lib-proxy.ps1 均带 BOM，确认是编辑工具行为差异。修复：[IO.File]::WriteAllText 以 UTF8Encoding($true) 重写补回 BOM。预防：准则 D2（改 .ps1 后语法检查+BOM 在位+无 powershell.exe 三检查）、D5（.ps1 恒带 BOM，编辑工具会剥，改完必补）；启动链整体切 pwsh.exe 7。验证：重跑 CheckOnly 全绿；后续多次脚本编辑均执行补 BOM 步骤。
