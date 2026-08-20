---
date: "2026-08-19T03:09:49.543Z"
symptom: "https://yx.maque.uno 后台全部路径 403 Forbidden，无法进入（admin-server/反代/证书均正常）"
component: "banmu-admin 部署 / 服务器 nginx"
severity: "major"
status: "fixed"
root_cause: "yx.maque.uno.conf 的 nginx IP 白名单（allow 127.0.0.1; allow 14.220.0.0/16; deny all）不含用户当前办公出口 IP 14.153.25.227，nginx server 级直接 deny 拦截；且站点无 access_log，403 无痕难查。"
fix: "备份 conf 后新增 allow 14.153.25.227;（deny all 之前），用 /www/server/nginx/sbin/nginx 校验并向宝塔 nginx 主进程 pidfile 发 HUP reload；顺带补 access_log /www/wwwlogs/yx.maque.uno.access.log;。外部直连验证 403→200。"
related_files:
  - "/www/server/panel/vhost/nginx/yx.maque.uno.conf"
  - "banmu-admin/deploy/nginx_admin.conf"
  - "BUGS.md"
---

用户报"无法进入后台"。先远端探测 https://yx.maque.uno/、/login、/api/admin/health、/api/admin/auth/login 全部 403；DNS 正常解析到 119.91.155.46，TLS 正常（能拿到 403 说明证书/握手 OK）。SSH（paramiko + F:\QiTa\banmu\SSH_key_fixed）核实：admin-server node dist/main.js 运行中（PID 58050）、3002 监听、Swagger 200、登录接口本地 401 正常返回业务 JSON——后端与反代健康。服务器 yx.maque.uno.conf 白名单为 allow 127.0.0.1 + 14.220.0.0/16 + deny all；nginx error log（/www/wwwlogs/nginx_error.log）记录 access forbidden by rule, client: 14.153.25.227, server: yx.maque.uno（ipip 回显本机出口同为 14.153.25.227，不在白名单段）。修复：备份后插入 allow 14.153.25.227;，注意服务器为双 nginx 实例（系统 /etc/nginx 与宝塔 /www/server/nginx/conf/nginx.conf），80/443 由宝塔实例（PID 58912）监听，PATH 下 nginx -s reload 作用系统实例无效，必须 /www/server/nginx/sbin/nginx -t -c 校验 + pidfile HUP；reload 后本机直连 /、/login、/api/admin/docs 全部 200，新 access log 记录 14.153.25.227 200 三连。另发现仓库 deploy/nginx_admin.conf 白名单（14.220.182.236）与服务器实际（14.220.0.0/16）不一致，需后续同步。
