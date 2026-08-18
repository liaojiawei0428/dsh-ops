# BUG 记录索引

共 6 条（fixed 6 / workaround 0 / open 0）。检索用 bug_search，统计用 bug_stats；本文件由 bug_report 自动重建，勿手编辑。

| 日期 | 记录 | 组件 | 严重度 | 状态 | 症状 |
|---|---|---|---|---|---|
| 2026-08-18 | [2026-08-18-update-dsh-ps1-parsererror-the-string-is](2026-08-18-update-dsh-ps1-parsererror-the-string-is.md) | dsh-ops-scripts | major | fixed | update-dsh.ps1 试运行 ParserError "The string is missing the terminator"，中文日志全部乱码 |
| 2026-08-18 | [2026-08-18-pnpm-run-build-ts6305-output-file-has-no](2026-08-18-pnpm-run-build-ts6305-output-file-has-no.md) | build-process | minor | fixed | pnpm run build 失败：数百个 TS6305 "Output file has not been built" 与 TS2339 声明合并错误，实际代码无任何改动问题 |
| 2026-08-18 | [2026-08-18-dsh-tool-python-dsh-13-05-assertsupporte](2026-08-18-dsh-tool-python-dsh-13-05-assertsupporte.md) | dsh-tool-python | critical | fixed | 新装 dsh-tool-python 插件后 DSH 无法启动：13:05 重启日志显示 assertSupportedJsonSchema 抛 UNSUPPORTED_SCHEMA 共 15 条违规 |
| 2026-08-18 | [2026-08-18-dsh-deepseek-balance-web-gui-session-log](2026-08-18-dsh-deepseek-balance-web-gui-session-log.md) | plugin-management | major | fixed | 安装 dsh-deepseek-balance 后 Web GUI 右上角出现固定悬浮胶囊并遮挡 Session log 按钮，而非预期的会话头部并列胶囊 |
| 2026-08-18 | [2026-08-18-dsh-3-dsh-web-stderr-log-credentials-yam](2026-08-18-dsh-3-dsh-web-stderr-log-credentials-yam.md) | dsh-ops-scripts | critical | fixed | DSH 启动失败：启动器 3 次重试全部在监听端口前崩溃，dsh-web-stderr.log 显示 .credentials.yaml YAML 解析错误 |
| 2026-08-18 | [2026-08-18-balance-capsule-no-auto-refresh](2026-08-18-balance-capsule-no-auto-refresh.md) | dsh-deepseek-balance | minor | fixed | 余额胶囊不自动刷新：页面加载后余额一直不变，只有手动点击才更新 |
