---
date: "2026-09-19T07:30:12.700Z"
symptom: "在 Python 装在 %LOCALAPPDATA%\\Python\\pythoncore-3.14-64（python.org per-user 新布局）的机器上，若未在 profile 里钉死 pythonPath，dsh-tool-python 会自动发现失败并报「未找到可用的 Python 3」；而 health-check 却能找到同一个解释器，两条定位链结论不一致"
component: "dsh-tool-python"
severity: "minor"
status: "fixed"
root_cause: "dsh-tool-python/index.js 的 pythonInstallRoots() 只扫描 %LOCALAPPDATA%\\Programs\\Python、%ProgramFiles%、%ProgramFiles(x86)%，缺 %LOCALAPPDATA%\\Python；且目录名过滤器 /^Python3\\d*/i 匹配不到 pythoncore-<ver>-64 这种命名。本机 python 恰在该布局，只是因为 health-check.ps1 含该根、且本机 personal.local.json 钉住了 pythonPath 才没暴露。"
fix: "roots 增加 %LOCALAPPDATA%\\Python；过滤器改为 /^(Python3\\d*|pythoncore-)/i；README 的「自动发现顺序」第 4 条同步写明三种布局。bootstrap-personal.ps1 现在还会在生成覆盖层时探测本机 python 并写入 plugins[tool-python].patch.config.pythonPath，作为第二重保险。"
related_files:
  - "DSH-ops/plugins/dsh-tool-python/index.js"
  - "DSH-ops/plugins/dsh-tool-python/README.md"
  - "DSH-ops/health-check.ps1"
  - "DSH-ops/bootstrap-personal.ps1"
---

发现路径：B 脚本扫描 INCONSISTENT（roots 覆盖不一致）。验证：写沙箱脚本复刻修改后的 roots+正则逻辑并实跑，实测输出 roots 含 %LOCALAPPDATA%\Python，列出 pythoncore-3.13-64 与 pythoncore-3.14-64，并按「取最高」命中 C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe；改后 node validate-plugins.mjs 仍 11 PASS、exit 0。
