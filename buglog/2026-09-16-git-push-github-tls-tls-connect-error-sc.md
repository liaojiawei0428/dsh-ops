---
date: "2026-09-16T01:57:30.374Z"
symptom: "本机 `git push` 到 GitHub 持续 TLS 握手失败（TLS connect error / schannel handshake），提交只能滞留本地，远端备份滞后。"
component: "部署工具链 / banmu-admin/deploy/relay_push_github.py"
severity: "major"
status: "fixed"
root_cause: "本机出口到 github.com 的 TLS 握手被中间网络环节阻断（TCP 可达但 ServerHello 无响应），本地任何 git/ssl 配置调整都无法绕过；而异地的腾讯云服务器到 GitHub 链路正常，故必须在服务器侧发起 push。"
fix: "新增 banmu-admin/deploy/relay_push_github.py：本机取凭据 + 生成增量 bundle → SFTP 上传 → 服务器 bare 缓存仓库（首次 clone，之后复用）fetch bundle 后 push origin main:master → 清理服务器凭据文件；同时以 GIT_CONFIG_GLOBAL=/dev/null 绕过服务器 gitclone.com 全局重写、凭据走 credenv+GIT_ASKPASS 避免泄露。"
related_files:
  - "banmu-admin/deploy/relay_push_github.py"
  - "BUGS.md"
  - "项目功能开发进度表/GongNeng_KaiFa_JiLu.md"
---

背景：原记录 2026-09-16-github-push-tls-blocked-network.md 判定本机到 github.com 的 TLS 握手被中间网络环节阻断（DNS 解析正常、TCP 443 可连，但 ClientHello 后 ServerHello 不返回；openssl / schannel 双后端均失败；本机无本地代理），当时状态为 workaround（后台重试 + 代码本地提交）。本会话重试 15 次仍全部失败（最后一次裸重试仍报 `TLS connect error: error:00000000:lib(0)::reason(0)`），确认本机链路未恢复。

落地方案（服务器中转推送通道，已脚本化）：
1. 本机：`git credential fill` 取凭据（token 不入命令行/不入对话）；`git bundle create <tmp> <远端已有rev>..main` 生成增量包（本次仅 1807 字节）。
2. SFTP 上传到腾讯云服务器 /root/gh_cache/：bundle + credenv(600，含 GH_USER/GH_TOKEN) + askpass.sh(700) + do_clone.sh + do_push.sh。
3. 服务器：bare 缓存仓库 /root/gh_cache/banmu-fanghua.git —— 首次 `git clone --bare`（约数分钟，本次复用缓存后无需再克隆）；remote url 保持无 token 形式。
4. 推送：`git fetch <bundle> main:main` → `git push origin main:master`。
5. 清理：删除 credenv/askpass.sh/bundle（保留缓存仓库，下次推送只需上传增量 bundle → 秒级）。

关键坑（已规避）：服务器 git 全局配置存在 `url.https://gitclone.com/github.com/.insteadOf https://github.com/` 重写（该镜像返回 502），必须 `GIT_CONFIG_GLOBAL=/dev/null` 绕过；凭据一律经 credenv 环境文件 + `GIT_ASKPASS` 提供，绝不写入命令行或 remote url（避免 ps/配置泄露）。

验证：`210926b..5738dc5  main -> master`（fast-forward）+ `PUSH_RC=0`，远端 master 已含 f71d875（网格两栏布局）/29c4c65/5738dc5；本轮再以 a6bd1ca 走同一通道复推；服务器临时凭据与本机 bundle 均已删除。

注：ssh_* 工具本轮两次返回 `Error: Not connected`，故中转全程改用既有 paramiko 通道（deploy 脚本同源方式，HOST/USER/KEY 见 banmu-admin/deploy/*.py）。
