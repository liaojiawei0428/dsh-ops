---
date: "2026-08-21T09:11:10.985Z"
symptom: "Clash TUN 虚拟网卡模式下，启动 DSH 检查更新被跳过、更新DSH.bat 报\"升级中止: 系统代理未启用\"，无法识别 VPN 已启动。"
component: "dsh-ops-deploy"
severity: "major"
status: "fixed"
root_cause: "网络判定逻辑只认注册表系统代理（ProxyEnable=1），把 TUN/虚拟网卡模式（ProxyEnable=0 但流量已走虚拟网卡、GitHub 直连可达）误判为\"本地代理配置问题\"，导致更新检查被跳过、升级被中止。"
fix: "lib-proxy.ps1 的 Set-ProxyEnvironment 增加直连降级：系统代理未启用时探测 github.com:443（Test-GitHubDirect，3s 超时），可达则判为 TUN/虚拟网卡直连模式继续流程（不设代理环境变量）；check-update.ps1 / update-dsh.ps1 提示文案改为\"网络通道\"双向措辞。DEPLOY.md 同步说明支持系统代理与虚拟网卡直连两种模式。"
related_files:
  - "E:\\DSH\\DSH-ops\\lib-proxy.ps1"
  - "E:\\DSH\\DSH-ops\\check-update.ps1"
  - "E:\\DSH\\DSH-ops\\update-dsh.ps1"
---

现象：Clash TUN 虚拟网卡模式（vpn07 Meta Tunnel 网卡 Up）下，系统代理 ProxyEnable=0（TUN 模式的正常状态），check-update.ps1 显示"系统代理未启用"并跳过检查，update-dsh.ps1 直接"升级中止"。而实测 GitHub 直连 200、TCP 443 可达——TUN 模式流量全走虚拟网卡，本不需要系统代理。

排查：lib-proxy.ps1 的 Get-SystemProxy 把 ProxyEnable=0 判为硬错误；Set-ProxyEnvironment 无直连分支；git 全局无 http.proxy、环境变量无 HTTP_PROXY。dsh-deepseek-balance/index.js 的 readSystemProxy 在 ProxyEnable=0 时返回 url=undefined → git fetch 直连，该路径本就自愈，无需改动。

修复：lib-proxy.ps1 的 Set-ProxyEnvironment 增加直连降级分支——系统代理不可用时先探测 github.com:443 TCP（3 秒超时，Test-GitHubDirect），可达则输出"虚拟网卡/TUN 模式，直连访问"并返回 $true（不设代理环境变量，git 直连）；不可达才报本地网络问题。check-update.ps1/update-dsh.ps1 文案同步改为"网络通道"措辞（代理或直连），update-dsh.ps1 输出通道类型。验证：D2 三检查全过；本机 TUN 场景 Get-SystemProxy→Enabled=False、Set-ProxyEnvironment→True、环境变量保持空；模拟"代理端口无监听"→False（原逻辑保留）；check-update.ps1 端到端跑通并发现官方新版本（远端 528c682e0616，本地 141eb6fef834，172 提交）。
