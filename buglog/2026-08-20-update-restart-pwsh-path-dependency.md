---
date: "2026-08-20T05:02:35.675Z"
symptom: "非标准 pwsh 安装（不在 PATH）的电脑上，自动更新完成全部构建后服务未重启，新版不生效，旧构建继续运行。"
component: "update-dsh.ps1"
severity: "major"
status: "fixed"
root_cause: "update-dsh.ps1 重启服务一步用裸名 pwsh.exe（PATH 查找）。在 pwsh 7 装于非标准位置且不在 PATH 的机器上，即使通过 DSH_PWSH_PATH 让插件成功启动了更新脚本，脚本内部裸名也会在更新全部完成后解析失败。"
fix: "update-dsh.ps1 L184 由裸名 pwsh.exe 改为 & (Join-Path $PSHOME 'pwsh.exe')——$PSHOME 是正在执行本脚本的 pwsh 7 自身安装目录，脚本能被启动它就必然有效，彻底消除 PATH 依赖。D2 三检查通过（语法 OK、UTF-8 BOM 已补回——edit 工具剥 BOM 后按 D5 用 UTF8Encoding($true) 重写补回、无 powershell.exe 引用）；$PSHOME 实测解析 E:\\GongJu\\7\\pwsh.exe 有效。DEPLOY.md 已知差异表补充 pwsh 定位链说明（DSH_PWSH_PATH → PATH → Program Files，非标准安装的两种处置方式）。validate-plugins + test-standard 复跑全绿。"
related_files:
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
  - "E:\\DSH\\DSH-ops\\DEPLOY.md"
---

(No additional details recorded.)
