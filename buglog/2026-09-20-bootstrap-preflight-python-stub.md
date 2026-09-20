---
date: "2026-09-20T02:12:05.954Z"
symptom: "bootstrap 第 0 步前置检查把 Microsoft Store 的 python 桩报成「前置 OK : python（…\\WindowsApps\\python.exe）」，与 DEPLOY.md 第 0 步「勿用 Microsoft Store 版」的告诫自相矛盾。"
component: "bootstrap-personal.ps1"
severity: "minor"
status: "fixed"
root_cause: "有效性检查只做了\"命令可解析\"（Get-Command 命中即算通过），没有做\"解析到的是可用的真实解释器\"，而 Windows 上 Microsoft Store 的执行别名会让 `python` 命令存在但不可用——同一仓库里 health-check.py 与覆盖层探测都对此专门排除了 WindowsApps，新检查漏了这条既定纪律。"
fix: "bootstrap-personal.ps1 前置检查：新增 `$pyIsStub = $py -and $py.Source -like '*\\WindowsApps\\*'`，命中即把 `$py` 置空；警告分支区分「完全没装」与「只找到 Store 桩」两种文案，后者明确写\"不会被采用\"并给 python.org 安装命令。"
related_files:
  - "bootstrap-personal.ps1"
  - "DEPLOY.md"
  - "research/deploy-sim/doc-defects.md"
dsh_commit: "3664f90d81"
---

发现路径：新加的「第 0 步前置条件检查」上线后，一位队友在 F:\ceshi_1 的隔离部署里如实记录了它的输出——`前置 OK : python（C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\python.exe）`，正是 DEPLOY.md 第 0 步明写「勿用 Microsoft Store 版」的那个桩。根因：`Get-Command python` 会命中 Store 的执行别名桩（`%LocalAppData%\Microsoft\WindowsApps\python.exe`），我只判断了"命令是否找得到"，没判断它是否是真解释器；health-check.py 与 bootstrap 后面的路径探测（生成 personal.local.json 时）都显式排除 WindowsApps，只有我这个新检查漏了。危害有限（第 5 步生成覆盖层时仍会排除该桩、最终写入的是真实解释器路径，已实测确认），但它与第 0 步自相矛盾，会误导用户以为"能跑就不必装 python.org 版"。修法：把 Source 含 `\WindowsApps\` 的 python 视为不可用，并在没有 py launcher 兜底时改印明确的桩警告。验证：把前置块提取成文件用 `pwsh -File` 跑两种 PATH——本机（桩 + py launcher 并存）输出 `前置 OK : python（py launcher）`（诚实：py 确实能拿到真解释器）；只留桩时输出「python 解析到 Microsoft Store 桩（…\WindowsApps\python.exe），不会被采用」+ 安装命令。
