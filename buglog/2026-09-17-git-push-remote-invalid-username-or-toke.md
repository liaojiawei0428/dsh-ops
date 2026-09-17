---
date: "2026-09-17T01:35:11.592Z"
symptom: "服务器中转 git push 认证失败（remote: Invalid username or token / fatal: Authentication failed），GitHub API 校验 token 返回 401 Bad credentials，提交无法推送到远端。"
component: "部署工具链 / banmu-admin/deploy/relay_push_github.py"
severity: "minor"
status: "open"
root_cause: "本机 git 凭据管理器中保存的 GitHub fine-grained PAT 已失效（GitHub API /user 返回 401 Bad credentials），与网络链路无关（服务器到 github.com HTTPS 返回 200）。"
fix: "待用户提供新 GitHub PAT（更新本机凭据后重跑 relay_push_github.py），或把服务器公钥 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAESWw4yPYk6NoT8zOwjE8iBJvkf3afQpLfOA+9DFI7Y banmu-relay@tencent 加入 GitHub 账号后改走 SSH 推送。"
related_files:
  - "banmu-admin/deploy/relay_push_github.py"
---

现象：服务器中转推送（relay_push_github.py）6 轮重试全部失败，错误分两类：①`remote: Invalid username or token. Password authentication is not supported for Git operations.` + `fatal: Authentication failed`；②`GnuTLS recv error (-110)` / `Failed to connect to github.com port 443`。此前 20 分钟内的两次推送（→5738dc5、→a6bd1ca、→8a885d5、→46c2247）均成功。

诊断（排除网络）：服务器 `curl -s -o /dev/null -w '%{http_code}' https://github.com` 返回 **200**，说明服务器到 GitHub 的 HTTPS 链路正常；GnuTLS/连接超时属于并发网络抖动，不是主因。

认证验证（token 全程不落命令行、不打印明文）：把本机 `git credential fill` 取到的 token 经 SFTP 写入服务器 600 权限文件，用 `curl -H "Authorization: Bearer $(cat ...)"` 调 GitHub API：
- `GET https://api.github.com/user` → **401 {"message":"Bad credentials"}**
- `GET https://api.github.com/repos/liaojiawei0428/banmu-fanghua` → **401**
- `git ls-remote https://x-access-token:<token>@github.com/...` → `Invalid username or token`
结论：本机凭据管理器里保存的 fine-grained PAT（github_pat_ 前缀，93 字符）已失效（GitHub fine-grained token 有强制有效期，最长 1 年，默认 30 天）。

备选通道排查：本机 `~/.ssh/test2` 是**加密私钥**（"Private key file is encrypted"，无 passphrase 无法使用），未验证是否已加入账号；服务器 `ssh -T git@github.com` 与 `ssh -T -p 443 git@ssh.github.com` 均返回 `Permission denied (publickey)`（服务器现有 id_ed25519 未加入 GitHub 账号）。已在服务器生成专用的 GitHub 推送密钥对 `/root/.ssh/github_banmu`（ed25519，无 passphrase），公钥待用户加入 GitHub 账号后即可改用 SSH 推送（长期有效，不受 token 过期影响）。

影响：仅远端备份滞后（本地提交 6dce91d 已就绪，远端 master 停在 46c2247）；线上功能与服务（3000/3002）不受影响。

状态：open —— 等待用户提供新 PAT 或把服务器公钥加入 GitHub 账号后即可完成推送。
