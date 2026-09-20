---
date: "2026-09-20T01:37:48.450Z"
symptom: "半亩芳华后台：构建与上传都成功、dist 文件已是新版，但线上行为仍是旧逻辑（改了代码没生效）；ps 显示监听 3002 的进程启动时间是前一天。"
component: "banmu-admin/deploy（重启流程）"
severity: "major"
status: "fixed"
root_cause: "用 pgrep -f \"dist/main.js\" | head -1 定位进程不可靠：会匹配多个历史残留进程并可能取到无关 PID，导致真正持有端口的进程未被杀死；新进程随后因 EADDRINUSE 静默退出，部署表现为\"假成功\"。"
fix: "重启 admin 改为按端口定位 PID（ss -tlnp 反查 :3002 持有者）→ kill → 确认端口释放 → 启动 → ss 回读确认新 PID 与启动时间，并清理所有残留 dist/main.js 进程。建议将该逻辑固化进部署脚本。"
related_files:
  - "banmu-admin/deploy/deploy_sysmsg_2b_admin_upload.py"
---

现象：修复 BUG-195 后执行 npm run build（成功）→ 上传 dist（242 文件，文件时间戳已是当天）→ 重启 admin，但线上行为仍是旧逻辑（guild_id 依旧为空）。排查：核对 dist 内容确认修复代码确实在（grep x-gm-token dist/modules/logic/logic.service.js 命中），转而用 ps -eo pid,lstart,args 查看进程，发现监听 3002 的进程启动时间竟是前一天，即运行的是旧进程。根因：重启脚本用 pgrep -f "dist/main.js" | head -1 取 PID，该模式会匹配到多个曾启动过的 node 进程（含历史诊断残留），head -1 可能取到无关进程；本次 kill 掉的是一个无关 PID，真正监听 3002 的进程未被终止；随后启动的新进程因端口被占用抛 EADDRINUSE 后立即退出，而该错误混在 90MB 的 admin_stdout.txt 里没有被察觉，于是形成"构建成功、上传成功、重启成功"但版本未生效的假成功。修复：改为按端口反查持有者——ss -tlnp | grep ':3002' | grep -oP 'pid=\K[0-9]+' 取 PID → kill → 确认端口已释放 → 启动 → 再用 ss 回读确认新 PID 与启动时间，并顺带清理所有残留 dist/main.js 进程。验证：重启后 ss 显示 pid=39897、启动时间 Sep 20 09:36:46（新），/logic/view 的 guild_id 随即变为 g_10004。教训：重启类操作必须以端口/资源持有者为锚点定位进程，且必须回读确认新版本真的生效。
