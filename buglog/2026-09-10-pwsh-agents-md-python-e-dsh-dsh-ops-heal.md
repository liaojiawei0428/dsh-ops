---
date: "2026-09-10T02:00:34.566Z"
symptom: "在 pwsh 中执行 AGENTS.md 规定的健康检查入口 python E:\\DSH\\DSH-ops\\health-check.py 报 \"Python was not found; run without arguments to install from the Microsoft Store\"，进程 exit 1，看起来像服务体检失败"
component: "python-env"
severity: "minor"
status: "fixed"
root_cause: "本机 PATH 中 C:\\Users\\Administrator\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe（Windows 应用商店占位符 stub）排在真实 Python（C:\\Users\\Administrator\\AppData\\Local\\Python\\bin\\python.exe）之前，where.exe python 第一项即为该 stub，任何 pwsh 会话中裸 python 都不会命中真实解释器"
fix: "已修：在 DSH-ops 新增 health-check.cmd/.ps1 包装入口（定位链：personal-hub\\personal.local.json 的 dsh-tool-python.pythonPath 权威路径 → py -3 启动器解析 sys.executable → PATH 中非 WindowsApps 的 python → LOCALAPPDATA glob；调用统一加 -X utf8 强制 UTF-8 输出，参数与退出码原样透传）；同步修正 AGENTS.md（DSH-ops 项目 L18/L37、用户全局 ~/.dsh、config/AGENTS-global-template.md）、PLUGIN-STANDARD.md（D7 纪律与工具表）、DEPLOY.md 体检表、health-check.py 自身用法注释为统一入口 health-check.cmd/ps1"
related_files:
  - "E:\\DSH\\DSH-ops\\health-check.py"
  - "E:\\DSH\\DSH-ops\\AGENTS.md"
  - "E:\\DSH\\DSH-ops\\DEPLOY.md"
  - "E:\\DSH\\DSH-ops\\PLUGIN-STANDARD.md"
dsh_commit: "b2e3b2a012"
---

触发场景：升级检查时用 pwsh 工具执行 python E:\DSH\DSH-ops\health-check.py，返回 stderr "Python was not found; run without arguments to install from the Microsoft Store..."，exit code 1。

诊断：where.exe python 输出两项，第一项是 WindowsApps 下的商店占位符，第二项才是 C:\Users\Administrator\AppData\Local\Python\bin\python.exe；Get-Command python -All 同样按该顺序返回。真实解释器位于 C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe（存在性已验证）。

影响范围：DSH 的 python 工具不受影响——dsh-tool-python 插件已在 personal.local.json 中固定绝对路径 pythonPath，故 AI 会话内 python 工具调用正常；受影响的是「按文档在 shell 里手敲 python」这一路径，会让人误判服务异常。文档中规定该入口的文件：AGENTS.md（准则 9 与工具表）、DEPLOY.md（第 4 步体检表）、PLUGIN-STANDARD.md（D7 纪律与工具表）、health-check.py 自身用法注释。

验证：改用绝对路径执行 & 'C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe' E:\DSH\DSH-ops\health-check.py 后输出 HEALTH: 全绿，exit 0（端口 3080 就绪、pid 40012、看门狗在岗、12 bundles、10 插件闸门 PASS、回归 4 项通过），确认服务本身无恙，纯属命令解析问题。

修复验证（2026-09-10）：包装器实测自动定位 C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe，全量体检 HEALTH: 全绿 exit 0（端口 3080、pid 40012、看门狗在岗、12 bundles、闸门 10 插件 PASS、回归 4 项通过）；-X utf8 后中文输出正常，docstring SyntaxWarning 已消除；全局 ~/.dsh/AGENTS.md 改动前版本已备份至 backups\AGENTS.md.bak-20260910-healthcheck-fix。
