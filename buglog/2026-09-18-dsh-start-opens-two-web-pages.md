---
date: "2026-09-18T10:17:31.162Z"
symptom: "DSH 启动或重启后会弹出两个 Web 端页面，其中一个是认证失败页（dsh web authentication required）"
component: "start-dsh-web.ps1"
severity: "minor"
status: "fixed"
root_cause: "官方 web-app 的 openBrowser 配置默认为 true（index.ts 第 61 行），dsh web 启动就绪后会自己用带认证 token 的 authenticatedUrl 打开默认浏览器（第 273-278 行）；而 start-dsh-web.ps1 在启动成功后又用裸地址 http://127.0.0.1:3080 打开了第二个页面。两条入口（启动DSH.bat、request_restart 经 dsh-restart-resume 调用 start-dsh-web.ps1 -Restart）都经过该脚本，所以启动与重启都会双开；且脚本开的那个因缺少 token 必然停在认证失败页。"
fix: "删除 start-dsh-web.ps1 启动成功分支里的 Start-Process 'http://127.0.0.1:3080'（改由 dsh web 自带的 openBrowser 交接，用带 token 的地址）；$existing 分支保留代开但改用新增的 Get-AuthenticatedUrl 从 dsh-web.log 解析带 token 的地址，解析失败才回落裸地址"
related_files:
  - "E:\\DSH\\DSH-ops\\start-dsh-web.ps1"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-restart-resume\\index.js"
  - "E:\\DSH\\DSH-ops\\启动DSH.bat"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\bundle\\web-app\\src\\index.ts"
  - "E:\\DSH\\DSH-ops\\dsh-web.log"
---

## 现象
用户报告：DSH 启动或重启后弹出两个 Web 页面。

## 排查路径（先排除了三个错误假设）
1. 假设 `start-dsh-web.ps1` 自身两处 `Start-Process` 都执行 → 读第 138-212 行，确认第 145 行 `if ($existing) { ... exit 0 }` 与第 180 行启动成功分支**互斥**，单次调用只开一个。排除。
2. 假设脚本被调用两次 → 读 `dsh-switch.log` 最近 40 行，每次重启**只有一条**"第 1 次尝试/D SH 服务启动成功"记录（17:24、17:25、18:13 三次均如此）。排除。
3. 假设看门狗也拉起启动器 → `watchdog-dsh.ps1` 第 194 行拉起的是 `$launcher`（启动器本身），且其日志会留痕，与观察不符。排除。

## 根因（决定性证据）
`dsh-web.log` 全文仅两行：
```
dsh web: http://127.0.0.1:3080/?token=4t1nBt7Fiv-GBuK078Wl35BKMOKgPV3Hp6x-3J3fz0Y
dsh web: opening the default browser; pass --no-open to disable
```
即 **`dsh web` 自己就会开浏览器**：官方 `packages/bundle/web-app/src/index.ts` 第 61 行 `openBrowser: z.boolean().default(true)`，第 229 行 `handoffBrowser = config.openBrowser && !launchedThroughSsh(...)`，第 273-278 行在就绪后调用 `internals.openBrowser(authenticatedUrl)` —— 用的是**带认证 token 的地址**（第 262 行 `connection.authenticatedUrl(webUrl)`）。

而 `start-dsh-web.ps1` 在启动成功分支（原第 190 行）又执行 `Start-Process 'http://127.0.0.1:3080'` —— **裸地址**。于是：
- 页面 A：`dsh web` 开的带 token 地址 → 能正常进入；
- 页面 B：脚本开的裸地址 → 必然停在 `dsh web authentication required; reopen the URL printed by dsh web`（本会话早前用 `Invoke-WebRequest http://127.0.0.1:3080` 撞到的同一个 401）。

用户 profile 的 `cordis.patch.yml` 未覆盖 `openBrowser`，因此默认 true 生效（`packages/bundle/web-app/cordis.patch.yml` 里那处 `openBrowser` 是官方 bundle 自带的，不是个人覆盖）。

两条入口都经过该脚本，所以启动和重启都双开：`启动DSH.bat` 第 11 行 → `start-dsh-web.ps1 -Restart`；`request_restart` → `dsh-restart-resume/index.js` 第 62 行 `RESTART_SCRIPT = join(OPS_DIR, 'start-dsh-web.ps1')`、第 144 行 `-File "${restartScript}" -Restart`。

## 修复
- **启动成功分支：删除 `Start-Process 'http://127.0.0.1:3080'`**，交给 `dsh web` 自己开（带 token，体验更好）；附注说明原因，避免后人加回来。
- **`$existing` 分支（服务已在运行）**：这条路径不启动 `dsh web`，它不会自己开，所以保留脚本代开；新增 `Get-AuthenticatedUrl` 从 `dsh-web.log` 解析最后一条 `^dsh web: (http://\S+)$`，用带 token 的地址打开，解析失败才回落裸地址。顺手修掉了这条路径原本也必然 401 的问题。
- 修复后三种场景都恰好一个页面：服务未运行→`dsh web` 开（带 token）；服务已运行→脚本开（带 token）；重启模式→先杀进程释放端口，走启动分支，仍只由 `dsh web` 开。

## 验证
- `Parser::ParseFile` 语法检查通过；
- UTF-8 BOM 与 `git show HEAD:` 版本一致（该脚本历来无 BOM，非本次引入；准则 5 的"补回 BOM"针对原本带 BOM 的脚本）；
- `powershell.exe` 仅出现在第 91/112 行 `Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'"` 进程名过滤器里，无实际调用，恒用 pwsh 7；
- 静态复核改动后的 `Start-Process` 出现点：第 104 行（看门狗，非浏览器）、第 166 行（`$existing` 分支，认证 URL）、第 179 行（node 启动）——开浏览器的点已收敛为一个。

## 实测验证（2026-09-18 18:17 重启）
以 `request_restart` 触发一次真实重启，重启后逐项取证：
- `dsh-switch.log` 尾部显示走的是「正在启动 DSH 服务，请稍候...」分支（18:17:45 停旧服务 → 18:17:48 端口释放 → 18:17:49 启动 → 18:17:53 成功），**没有**出现「DSH 服务已在运行」，即本次未进入 `$existing` 分支，脚本侧的开点未被执行；
- `dsh-web.log` 仍为两行，含 `dsh web: opening the default browser`，且 token 随重启刷新（`token=Vbyh_Dafu_...`）——`dsh web` 开了唯一那个带 token 的页面；
- 脚本内开浏览器的点已收敛为第 166 行一处，且位于第 158 行起的 `$existing` 分支内。

**用户肉眼确认：只有一个页面，且能正常进入界面。** 修复闭环。
