---
date: "2026-08-18T09:04:37.161Z"
symptom: "自动更新完成后服务仍是旧版本：update-dsh.ps1 按过期的 dsh-web.pid 杀进程，端口 3080 实际被另一进程占用导致 start-dsh-web.ps1 直接退出"
component: "update-dsh.ps1"
severity: "major"
status: "fixed"
root_cause: "update-dsh.ps1 重启段只信 dsh-web.pid 文件；该文件由 start-dsh-web.ps1 写入，服务器经 restart-dsh-web.ps1（WMI 独立启动）拉起时不更新它，导致 pid 文件过期，杀死错误/不存在的进程后端口仍被占，start-dsh-web.ps1 直接退出。"
fix: "update-dsh.ps1 重启段增强：pid 文件指向的进程不存在时，用 Get-NetTCPConnection -LocalPort 3080 找真实监听进程并 Stop-Process，保证自动更新真的换上新构建。"
related_files:
  - "D:/GongJu/DSH-ops/update-dsh.ps1"
---

自动更新功能开发时审查 update-dsh.ps1 重启段发现：它只按 dsh-web.pid 文件杀旧进程，但该文件由 start-dsh-web.ps1 写入，而服务器近期由 restart-dsh-web.ps1（WMI 独立启动）拉起时不会更新 pid 文件——实测 pid 文件内容为 17032，实际监听端口的是 30320。若点击"有新版本"自动更新，会杀掉不存在的旧 pid（或错进程），然后 start-dsh-web.ps1 发现端口 3080 仍被占直接退出——更新流程"成功"但新构建永远不会生效。修复：pid 文件进程不存在时，按端口 3080 找真实监听进程兜底杀死。验证：闸门全绿，语法检查通过。
