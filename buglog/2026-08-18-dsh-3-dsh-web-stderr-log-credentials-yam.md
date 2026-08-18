---
date: "2026-08-18T06:43:15.995Z"
symptom: "DSH 启动失败：启动器 3 次重试全部在监听端口前崩溃，dsh-web-stderr.log 显示 .credentials.yaml YAML 解析错误"
component: "dsh-ops-scripts"
severity: "critical"
status: "fixed"
root_cause: "Set-Content -NoNewline 接收字符串数组时无分隔符拼接行元素，两行 \"KEY: value\" 被合并成一行产生非法 YAML；凭据插件 fail-loud 加载崩溃。"
fix: "恢复 .credentials.yaml 为合法两行结构；update-dsh.ps1 增加改前结构校验与自动备份；准则 D4 禁止行级拼接写用户数据文件。"
related_files:
  - "C:/Users/37868/.dsh/.credentials.yaml"
  - "D:/GongJu/DSH-ops/update-dsh.ps1"
dsh_commit: "99f6f02fec"
---

用 Set-Content -NoNewline 写入字符串数组替换 DEEPSEEK_API_KEY 时，Windows PowerShell 将数组元素不加任何分隔符地拼接，两行 "KEY: value" 合并为一行，值中出现第二个 ": "，YAML 解析失败。凭据插件按设计 fail-loud（"文件有任何问题就报错，不静默忽略"），宿主进程在监听端口前崩溃退出；启动器 3 次重试全部死于同一解析错误，DSSH 无法启动。修复时手工恢复两行结构。预防：update-dsh.ps1 1.5 步加凭据结构校验（值中不允许冒号）、1.6 步改前自动备份到 ~/.dsh/backups/<时间戳>/；PLUGIN-STANDARD D4 规定用户数据文件整体原子重写、禁止行级拼接。验证：恢复后服务正常启动；CheckOnly 模式全链路通过（凭据文件结构 OK）。
