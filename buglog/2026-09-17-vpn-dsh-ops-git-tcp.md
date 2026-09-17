---
date: "2026-09-17T01:45:44.959Z"
symptom: "未开 VPN 代理软件时\"检查更新\"报异常；代理开关变化后不重启 DSH 不生效；ops 脚本的\"直连降级\"被 git 全局硬绑定架空，且 TCP 探测假阳性会把不可达的直连误判为可达。"
component: "dsh-deepseek-balance / DSH-ops 代理层 (lib-proxy.ps1)"
severity: "major"
status: "fixed"
root_cause: "全局 git 配置 C:\\Users\\Administrator\\.gitconfig 里的 URL 特定代理 [http \"https://github.com\"] proxy=http://127.0.0.1:7688 是静态硬绑定，优先级高于一切 http_proxy/HTTPS_PROXY 环境变量，git 访问 GitHub 被它独占；叠加另外两个缺陷放大危害：(a) lib-proxy.ps1 的 Test-GitHubDirect 只做 TCP 443 握手探测，本机实测\"TCP 0.1s 成功但真实 HTTPS 被 RST\"，遂误判\"直连可达\"而放弃代理；(b) 插件 dsh-deepseek-balance 的代理探测结果每进程只读一次并永久缓存，代理开关变化后不重启 DSH 不生效。三者共同导致：VPN 代理软件没开时 7688 无监听 → git fetch 立即失败 → 插件把失败降级成 checkError（hasUpdate 恒 false），胶囊只在悬停提示里显示\"检查异常\"，主界面看起来像插件坏了。"
fix: "1) .gitconfig 删除 URL 特定代理（备份后原子重写）；2) lib-proxy.ps1 直连探测改用真实 HTTPS HEAD 请求（UseProxy=false），并补 NO_PROXY 与大小写代理变量；3) 插件代理探测改 30 秒 TTL + 端口存活检查（死端口降级直连），checkError 附通道信息；4) 新增 pwsh profile（F:\\文档\\PowerShell\\）在交互式终端动态设置 git 代理，补上删除硬绑定后的手动 git 场景。"
related_files:
  - "C:\\Users\\Administrator\\.gitconfig"
  - "E:\\DSH\\DSH-ops\\lib-proxy.ps1"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\index.js"
  - "F:\\文档\\PowerShell\\Microsoft.PowerShell_profile.ps1"
  - "C:\\Users\\Administrator\\.dsh\\backups\\20260917-094057\\gitconfig.bak"
dsh_commit: "c291e7961a51"
---

承接同日 open 记录 2026-09-17-vpn-update-check-failed.md（根因定位），本条为修复与验证。

改动清单：

1) 移除全局硬绑定 —— C:\Users\Administrator\.gitconfig 删除 [http "https://github.com"] 段（proxy=http://127.0.0.1:7688 + sslVerify=true），原子重写（临时文件 + os.replace）；改动前备份到 C:\Users\Administrator\.dsh\backups\20260917-094057\gitconfig.bak（sha256[:16]=af1186ca3c48d200，改前改后一致校验通过）。验证：git config --get http.https://github.com.proxy 现 rc=1（不存在），user.name/email 保留；E:\DSH\DSH-ops 与 Deepseek_DSH 的本地 .git/config 内本无 proxy 行。

2) lib-proxy.ps1 Test-GitHubDirect：TCP 握手探测 → 真实 HTTPS HEAD 请求（System.Net.Http.HttpClientHandler，显式 UseProxy=$false，5 秒超时，HttpMethod.Head 到 https://github.com/，StatusCode<500 视为可达）。验证 UseProxy 生效：把 HTTP_PROXY/HTTPS_PROXY 指向死端口 http://127.0.0.1:1 后调用仍返回 True（若读了环境变量代理应为 False）→ 证明这是"绕过代理的直连探测"。

3) lib-proxy.ps1 Set-ProxyEnvironment：代理就绪时同时设置大小写四变量（http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY）+ NO_PROXY/no_proxy=localhost,127.0.0.1,::1（沿用 2026-08-28 health-check 经系统代理 502 循环事故的教训：本地地址必须排除代理）。

4) dsh-deepseek-balance/index.js：代理探测由"每进程永久缓存"改为 30 秒 TTL + 新增 probeProxyPort（node:net TCP 探测 500ms）——注册表 ProxyEnable=1 但端口没监听时降级直连，不再把 git 指向死端口；git() 同时注入大小写四变量；checkError 附实际通道（"经代理 X" / "直连（原因）"），使悬停提示直接指向"VPN 未开启"。

5) 新增补偿：F:\文档\PowerShell\Microsoft.PowerShell_profile.ps1（UTF-8 BOM；$PROFILE 因文档目录重定向落在此处）——交互式终端每次启动按"注册表代理 + 端口是否在监听"动态设置/清空代理环境变量，并提供 git-proxy(Set-DshGitProxy) 手动重跑。补偿理由：删掉 .gitconfig 硬绑定后，用户手动 git 命令不能再依赖它。零副作用依据：DSH 的 pwsh 执行器固定带 -NoLogo -NoProfile -NonInteractive（packages/shell/pwsh-local/src/index.ts:220），不加载该文件。

验证证据：
- 分支 1（系统代理启用但端口无监听 = VPN 代理软件没开）：Set-ProxyEnvironment 输出"[代理诊断] 代理地址 http://127.0.0.1:1 的端口 1 没有服务在监听 / 这是本地问题: VPN 软件可能未运行…请先开启 VPN"，返回 False → update-dsh.ps1 会中止并给出准确原因（修复前 TCP 探测假阳性会误判"直连可达"，让 git 卡 21 秒后失败且报"VPN 节点失效"）。
- 分支 2（ProxyEnable=0，TUN 模式）：输出"探测直连 GitHub... 直连可达（虚拟网卡/TUN 模式），本次将直连访问 GitHub"，返回 True。
- 端到端：check-update.ps1 → "[代理诊断] 系统代理已就绪: http://127.0.0.1:7688" → git fetch 成功 → "发现 DSH 新版本！本地 c291e7961a51 远端 0d1f50007f9b，新增提交 666 个"，exit 0。
- profile 两态：子 pwsh（不带 -NoProfile）加载后 HTTPS_PROXY=http://127.0.0.1:7688、NO_PROXY 已设、git-proxy 可用；Set-DshGitProxy -Url http://127.0.0.1:1 返回 False 且清空代理变量，切回默认端口返回 True。
- 闸门/回归：node validate-plugins.mjs 全绿（10 个插件，exit 0）；node test-standard.mjs T1–T4 全 PASS（exit 0）；D2 检查 lib-proxy.ps1 与 profile 均 BOM 在位、无 powershell.exe 引用、UTF-8 解码 OK（edit 工具剥 BOM 后已补回）。

仍未做（本次范围外，建议后续）：插件前端胶囊在 checkError 时无可见失败态（仍显示"DSH版本号：x"，错误藏在悬停提示中），即前述 B 方案。
