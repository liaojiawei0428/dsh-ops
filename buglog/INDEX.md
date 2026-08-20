# BUG 记录索引

共 6 条（fixed 6 / workaround 0 / open 0）。检索用 bug_search，统计用 bug_stats；本文件由 bug_report 自动重建，勿手编辑。

| 日期 | 记录 | 组件 | 严重度 | 状态 | 症状 |
|---|---|---|---|---|---|
| 2026-08-20 | [2026-08-20-update-restart-pwsh-path-dependency](2026-08-20-update-restart-pwsh-path-dependency.md) | update-dsh.ps1 | major | fixed | 非标准 pwsh 安装（不在 PATH）的电脑上，自动更新完成全部构建后服务未重启，新版不生效，旧构建继续运行。 |
| 2026-08-20 | [2026-08-20-tool-python-store-stub-discovery](2026-08-20-tool-python-store-stub-discovery.md) | dsh-tool-python | major | fixed | 新电脑按模板部署且未配置 pythonPath 时，python 工具可能因 PATH 上的 WindowsApps 存根 python.exe 而无法执行任何任务。 |
| 2026-08-20 | [2026-08-20-balance-capsule-click-crash](2026-08-20-balance-capsule-click-crash.md) | dsh-deepseek-balance | critical | fixed | 点击右上角版本胶囊"有新版本"后，DSH 服务进程直接崩溃退出（Web 页面断连），需手动重启 DSH。 |
| 2026-08-20 | [2026-08-20-balance-capsule-autoupdate-pwsh-path](2026-08-20-balance-capsule-autoupdate-pwsh-path.md) | dsh-deepseek-balance | major | fixed | DSH Web 右上角版本胶囊显示"有新版本"，点击后显示"正在更新…"，但自动更新程序（update-dsh.ps1）从未运行，版本不升级。 |
| 2026-08-20 | [2026-08-20-balance-autoupdate-invisible-progress](2026-08-20-balance-autoupdate-invisible-progress.md) | dsh-deepseek-balance | minor | fixed | 点击右上角"有新版本"后仅胶囊显示"正在更新…"，更新过程（git 拉取/依赖下载/构建）完全无进度可见，用户不清楚发生了什么。 |
| 2026-08-19 | [2026-08-19-banmu-admin-yx-nginx-403-whitelist](2026-08-19-banmu-admin-yx-nginx-403-whitelist.md) | banmu-admin 部署 / 服务器 nginx | major | fixed | https://yx.maque.uno 后台全部路径 403 Forbidden，无法进入（admin-server/反代/证书均正常） |
