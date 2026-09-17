---
date: "2026-09-16T01:57:36.791Z"
symptom: "ssh_bash 调用立即返回 `Error: Not connected`（连续两次），而同一服务器的 paramiko 直连正常。"
component: "dsh-server-ssh（ssh_bash 工具）"
severity: "minor"
status: "workaround"
root_cause: "未定位：ssh_bash 立即返回 Not connected 而同刻 paramiko 直连成功，指向 DSH ssh 工具的连接/会话态失效而非网络、认证或主机密钥问题（历史上 dsh-server-ssh 出现过同类「会话态失活」记录）。"
fix: "本轮绕过：改用 paramiko + SSH key 直连执行远端命令（部署与中转推送脚本同源）。根因未定位（工具层会话态问题），未做代码改动。"
related_files:
  - "banmu-admin/deploy/relay_push_github.py"
  - "banmu-admin/deploy/deploy_dist_local.py"
---

现象：同一会话内连续两次调用 ssh_bash（命令为只读的 df/git --version/find/ls 组合）均立即返回 `Error: Not connected`，无命令输出、无 rc；同一时刻参数完全相同目标的 paramiko 直连（HOST 119.91.155.46，key F:\QiTa\banmu\SSH_key_fixed）一次成功，说明服务器可达、凭据有效、网络无问题，故障位于 DSH 的 ssh 工具/会话层。

已排除：服务器宕机或 SSH 服务停止（paramiko 同刻连通）、主机密钥未信任（未报 HOST_KEY_UNTRUSTED）、认证失败（未报 AUTH_FAILED/PASSWORD_REQUIRED）、命令本身超时（错误立即返回，非超时）。

规避：本轮全部远端操作改用 paramiko 通道（banmu-admin/deploy/*.py 既有模式），未影响交付。历史同类：2026-09-05-dsh-ssh-github-token-client-bundle-hmr.md（ssh/github 面板内容全空，重建 client bundle 触发 HMR 后恢复）——同属「面板/工具会话态失活」一族，本次未复现该面板问题（未打开面板）。

后续若再次出现，建议依次检查：DSH 服务日志中 server-ssh 加载/连接记录、面板中该服务器的连接状态、必要时对插件做一次重载（HMR/重启服务）后再复测 ssh_bash。
