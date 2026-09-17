---
date: "2026-09-16T01:39:52.688Z"
symptom: "git push 到 GitHub 持续 TLS 握手失败（TCP 可连但 ServerHello 无响应）"
component: "环境/网络（GitHub 推送链路）"
severity: "major"
status: "workaround"
root_cause: "本机到 github.com 的 TLS 握手被中间网络环节阻断（DNS/TCP 正常但 ServerHello 不返回，多后端多版本均失败，python 复测不稳定）。"
fix: "判定链路干扰（非配置问题）；本地提交保留 + 后台间隔自动重推；线上部署照常（不依赖 GitHub）。"
related_files:
  - "BUGS.md"
---

提交左右布局调整（f71d875）后 git push origin main:master 失败：`TLS connect error: error:00000000:lib(0)::reason(0)`；改 schannel 后端报 `failed to receive handshake`；显式 TLSv1.2 / HTTP/1.1 均失败；GIT_CURL_VERBOSE 显示 ClientHello 发出后约 5 秒无响应（OpenSSL SSL_connect: SSL_ERROR_SYSCALL）。排查：DNS 解析正常（github.com→20.205.243.166）、TCP 443 可连；python OpenSSL 首次抽查曾偶发握手成功，复测即 UNEXPECTED_EOF_WHILE_READING；本机无本地代理监听（7890/7897/10809/1080/8889/10808/2080/33210）；git 无 proxy 配置、sslBackend=openssl。判定为本机到 github.com 的 TLS 握手被中间网络环节干扰（非 git 配置/非代码问题）。处置：代码与部署不受影响（部署走腾讯云服务器），本地提交已落地（f71d875、29c4c65、5738dc5），启动后台按 20 秒间隔自动重试推送（最多 15 次）待链路恢复补推；若持续失败需用户侧网络/代理支持。
