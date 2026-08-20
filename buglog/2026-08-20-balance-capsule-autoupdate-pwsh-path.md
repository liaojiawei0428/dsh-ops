---
date: "2026-08-20T04:58:15.178Z"
symptom: "DSH Web 右上角版本胶囊显示\"有新版本\"，点击后显示\"正在更新…\"，但自动更新程序（update-dsh.ps1）从未运行，版本不升级。"
component: "dsh-deepseek-balance"
severity: "major"
status: "fixed"
root_cause: "dsh-deepseek-balance 插件 launchUpdater() 硬编码 spawn 'C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe'，本机该路径不存在（pwsh 7 实际装在 E:\\\\GongJu\\\\7\\\\pwsh.exe），spawn ENOENT 是异步 error 事件而代码直接返回 started:true → HTTP 200 ok:true → 胶囊显示\"正在更新…\"但 update-dsh.ps1 从未启动（dsh-update.log 无任何新记录）。次要根因：主仓库 detached 于 dsh-v0.1.0-rc.7 tag（branch --show-current 为空），即使 pwsh 启动成功，update-dsh.ps1 的 git pull --ff-only 也会因 \"You are not currently on a branch\" 失败。"
fix: "index.js 新增 resolvePwsh()（DSH_PWSH_PATH → PATH 各目录 → Program Files 默认位逐个探测）；launchUpdater 改为等待 child 的 spawn/error 事件后才返回 started:true/false（spawn 失败如实返回 500，前端胶囊显示\"更新启动失败\"而非假\"正在更新…\"）；env 注入 DSH_UPDATE_SOURCE=auto 使版本台账正确记\"自动更新\"。README 同步补充 pwsh 定位说明。主仓库执行 git checkout master + branch --set-upstream-to=origin/master（指向不变 99f6f02fec，behind 536，ff 可行）。validate-plugins.mjs 4 插件全绿，test-standard.mjs T1–T4 全过。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\README.md"
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
---

(No additional details recorded.)
