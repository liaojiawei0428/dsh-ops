---
date: "2026-09-17T01:35:21.778Z"
symptom: "未开启 VPN 代理软件时，浏览器右上角版本胶囊的\"检查更新\"报异常（悬停显示\"检查异常: update check failed …\"），且明明有新版也不提示；开启代理软件后立刻恢复，并能检测到官方新提交。"
component: "dsh-deepseek-balance / git 全局代理配置"
severity: "major"
status: "open"
root_cause: "全局 git 配置 C:\\Users\\Administrator\\.gitconfig 写入了 URL 特定代理 [http \"https://github.com\"] proxy = http://127.0.0.1:7688。该配置优先级高于任何 http_proxy/HTTPS_PROXY 环境变量，git 访问 github.com 时被强制只走本机 7688。VPN 代理软件（vpn07Core）未运行时 7688 无监听，git fetch origin 立即失败（Failed to connect to 127.0.0.1 port 7688）。插件 dsh-deepseek-balance 的 checkRepoUpdate 把失败降级为 checkError 且 hasUpdate 恒为 false，前端胶囊不进入错误态（无红色标记），只在 hover 的 title 里带\"检查异常\"，故表现为\"插件异常\"。"
fix: "尚未修复（根因已定位，用户当前以开启代理软件规避）。建议修复次序：1) 删除 .gitconfig 中的 URL 特定代理，git 代理统一由 DSH-ops/lib-proxy.ps1 的环境变量 + 真实 HTTPS 探测管理，或在脚本/插件里显式用 `git -c http.https://github.com.proxy=<值>` 覆盖；2) 将 lib-proxy.ps1 的 Test-GitHubDirect 从 TCP 443 探测改为真实 HTTPS 请求（当前会假阳性）；3) 插件在 fetch 失败时于胶囊上显示可见失败态并提示\"请开启 VPN/代理软件\"。"
related_files:
  - "C:\\Users\\Administrator\\.gitconfig"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\client.js"
  - "E:\\DSH\\DSH-ops\\lib-proxy.ps1"
dsh_commit: "c291e7961a51"
---

调查过程与实测证据（2026-09-17）：

1) 复现与现状：GET /api/dsh/repo-status 与 ?force=1 均 200，返回 version=0.1.5-rc.2、current=c291e7961a51、latest=0d1f50007f9b、hasUpdate=true，无 checkError —— 即在代理软件运行的一切正常。dsh-web.err.log 为 0 字节、dsh-web.log 仅 146 字节，服务端无相关日志（属性：检查失败只回响应体、不落盘）。

2) 定位配置来源：git config --get http.https://github.com.proxy 返回 http://127.0.0.1:7688，但仓库 .git/config 内无 proxy 行；--show-origin 显示为 global file:C:/Users/Administrator/.gitconfig。其内容为 [http "https://github.com"] proxy=http://127.0.0.1:7688 / sslVerify=true，末次修改 2026-09-05 12:59。dsh-github-push 插件只写环境变量（HTTP_PROXY/http_proxy 等）、不写 .gitconfig，故该配置为人工写入。

3) 优先级实测（关键证据）：设 https_proxy=http://127.0.0.1:1（死端口）后 `git ls-remote origin HEAD` 仍 rc=0 成功 → 证明 URL 特定配置覆盖环境变量；加 `-c http.https://github.com.proxy=` 清空后，同样死端口环境变量下 rc=128（Recv failure: Connection was reset）→ 这才真正走了环境变量。

4) 直连不可达：清空 URL 代理且不设任何代理环境变量时，`git ls-remote origin HEAD` 在 21094 ms 后失败（Failed to connect to github.com port 443）。注意 Python socket 对 github.com:443 的 TCP 握手却"0.1s 成功"—— TCP 探测假阳性，实际 TLS/HTTP 被重置。这使 lib-proxy.ps1 的 Test-GitHubDirect（仅 TCP connect）在 TUN/ProxyEnable=0 场景下可能误判"直连可达"而放弃代理，属同类隐患。

5) 复现用户当时的失败：`git -c http.https://github.com.proxy=http://127.0.0.1:1 fetch origin` → rc=128 "fatal: unable to access 'https://github.com/deepseek-ai/deepseek-harness.git/': Failed to connect to 127.0.0.1 port 1 after 2052 ms: Could not connect to server"，与代理软件未运行时 7688 被拒的连接错误形态一致。

6) 前端表现：client.js 的 VersionHeader 在 checkError 存在但 version 可读时仍走 status='ok' 分支，显示"DSH版本号：<version>"且 hasUpdate=false，仅 title 里带"检查异常: …"，与"已是最新"视觉上无法区分 —— 这是"看起来像插件坏了"的直接原因。

关联历史记录：buglog/2026-08-21-tun-mode-update-chain-blocked.md（同为代理识别导致的更新链问题）、2026-09-16-github-push-tls-blocked-network.md。
