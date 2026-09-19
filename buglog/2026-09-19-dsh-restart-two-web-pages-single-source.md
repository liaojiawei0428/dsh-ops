---
date: "2026-09-19T01:31:45.222Z"
symptom: "DSH 重启后弹出两个 Web 页面（上一轮修复后用户反馈仍存在），且两个页面都能正常进入界面，不是认证失败页"
component: "start-dsh-web.ps1 / web-app openBrowser"
severity: "minor"
status: "fixed"
root_cause: "存在两个互不感知的浏览器开启来源：dsh web 自带的 openBrowser（web-app Config 默认 true，用带 token 的 authenticatedUrl 打开）与 start-dsh-web.ps1 自己的开点。上一轮修复只删掉了脚本在启动分支的开点，但脚本的 $existing 分支（服务已在运行）仍会开，两条路径都可能被走到，于是各开一个；叠加浏览器不关旧标签页、已认证 cookie 让旧页面继续可用，用户持续看到两个都能进入的页面。真正要修的是「两个来源」本身，而不是某一条路径的行为。"
fix: "把浏览器开启收敛为单一来源：start-dsh-web.ps1 启动 dsh web 时加 --no-open 关掉它自带的 openBrowser 交接（printUrl 默认仍 true，日志照常打印带 token 地址）；启动成功分支改为由脚本用 Get-AuthenticatedUrl 取日志中的带 token 地址打开（加最多 10 秒轮询等待日志就绪，取不到才回落裸地址兜底），$existing 分支同样开带 token 地址"
related_files:
  - "E:\\DSH\\DSH-ops\\start-dsh-web.ps1"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\bundle\\web-app\\src\\index.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\bundle\\web-app\\src\\startup.ts"
  - "E:\\DSH\\DSH-ops\\dsh-switch.log"
  - "E:\\DSH\\DSH-ops\\dsh-web.log"
  - "E:\\DSH\\DSH-ops\\watchdog.log"
---

## 现象
2026-09-18 上一轮修复（删除脚本启动分支的裸地址开点）后，用户反馈「重启还是会弹出两个 Web 页面」，且**两个都能正常进入界面**。

## 排查与已排除项（都有实测证据）
1. **不是脚本被调用两次**：`dsh-switch.log` 每次重启只有一条「正在启动 → 启动成功」记录，**没有**「DSH 服务已在运行」（18:40 那次同样）。
2. **不是看门狗**：`watchdog.log` 在 18:40 前后无任何拉起动作（最后一条是 09-18 09:09 的「恢复监听」）。
3. **不是第三个开点**：全仓库 grep `Start-Process.*http|openBrowser|xdg-open|127.0.0.1:3080`，DSH-ops 侧唯一开浏览器处就是 `start-dsh-web.ps1`（`update-dsh.ps1:336` 的 127.0.0.1:3080 是健康检查用的 `Invoke-WebRequest`，不开浏览器）。
4. **不是 desktop app**：进程表里只有一个 DSH 服务实例（`node apps/cli/lib/bin.js web`），无 electron/tauri；其余 node 是 Adobe Creative Cloud。
5. **`dsh web` 侧只开一次**：`dsh-web.log` 仅 1 行 URL + 1 行 `opening the default browser`；官方 `web-app/src/index.ts` 用 `ANNOUNCED_ROOTS = new WeakSet<Context>()` 保证 announce 幂等；`openBrowser` 走 npm `open` 包一次调用、不重试。

## 根因判断（两条独立开点，非某一条路径的行为）
`dsh web` 自带 `openBrowser`（`web-app/src/index.ts:61` 默认 true，第 273-278 行用带 token 的 `authenticatedUrl` 打开），与 `start-dsh-web.ps1` 自己的开点，是**两个互不感知的来源**。上一轮只删掉了脚本在**启动分支**的开点，于是启动路径上只剩 `dsh web` 一个；但脚本的 **`$existing` 分支（服务已在运行）仍会开**，两条路径一旦都被走到（重复调用启动器、看门狗补拉等）就会各开一个。再加上浏览器不会关闭旧标签页、且已认证的 cookie 让旧页面继续可用，用户就会持续看到两个「都能正常进入」的页面。

**未能确证的部分（诚实记录）**：用户不便查看两个页面的 `?token=` 串，因此无法区分「同一次重启真的双开」与「跨多次重启的旧标签页累积（本会话共重启 5 次以上，每次各开一个）」。三种日志证据都指向单次只开一个，倾向后者；但**无论哪种，把两个来源收敛成一个都是正确的修复**，且修复效果可自证（见下）。

## 修复：收敛为单一来源
- `start-dsh-web.ps1` 启动 node 时加 **`--no-open`**（`startup.ts:52` 的官方 flag），关掉 `dsh web` 自己的浏览器交接。**不影响 `printUrl`**（`web-app/src/index.ts:62` 默认 true），`dsh-web.log` 仍写下带 token 的地址。
- 页面统一由脚本开一次：启动成功分支用 `Get-AuthenticatedUrl` 从日志取带 token 地址后 `Start-Process`；因为 `announceReady()` 在 `connection` 就绪后才写日志、晚于端口监听（脚本判就绪的依据），这里加了最多 10 秒的轮询等待，取不到才回落裸地址兜底并写日志说明。
- `$existing` 分支（服务已在运行、`dsh web` 不会启动）保持由脚本代开，同样走带 token 地址。

结果：**无论重启多少次、无论哪条路径，开页面的来源只有一个**。

## 验证
- `Parser::ParseFile` 语法检查通过；UTF-8 BOM 与 `git show HEAD:` 一致（该脚本历来无 BOM）；`powershell.exe` 仅出现在 91/112 行 `Get-CimInstance` 的进程名过滤器里。
- 静态复核：`Start-Process` 出现点为 104（看门狗，非浏览器）、166（`$existing` 分支）、183（node 启动）、226（启动成功分支）——**开浏览器点两个且互斥**。
- **实测验证（2026-09-19 09:32 重启）**：
  - `dsh-web.log` 只有 1 行 `dsh web: http://127.0.0.1:3080/?token=-MqB52...`，**`opening the default browser` 这一行已消失** —— 这是 `--no-open` 生效的直接证据（`printUrl` 仍工作，所以脚本照常拿得到带 token 地址）；
  - `dsh-switch.log`：09:31:56 停旧服务 → 09:31:59 启动 → 09:32:03 成功，只走一次启动分支；
  - 开浏览器点静态复核仍为 166 与 226 两处且互斥；
  - `check-plugin-copy.mjs` 与 `validate-plugins.mjs`（11/11）均绿。
  - **用户肉眼确认：本次重启只新开了 1 个页面。** 修复闭环。

## 遗留
用户不便查看两个页面的 `?token=` 串，因此未能确证此前那两个页面属于「同一次真的双开」还是「本会话 5 次以上重启留下的旧标签页累积」。三份日志证据（每次只有一条启动记录、看门狗无动作、`dsh web` 只 announce 一次）倾向累积说，但未定案。若将来再出现双开，最硬的取证是**录制进程创建事件**（看究竟是谁 spawn 了浏览器），而不是继续比对日志。
