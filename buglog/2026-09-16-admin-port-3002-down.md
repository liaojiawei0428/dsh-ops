---
date: "2026-09-16T03:14:19.347Z"
symptom: "部署脚本在重启服务阶段读取超时抛异常中断后续阶段；同时脚本报 admin 端口未监听（PORT_3002_DOWN），实际服务运行正常。"
component: "banmu-admin/deploy/deploy_scene_grid.py"
severity: "minor"
status: "fixed"
root_cause: "①nohup 后台进程继承 ssh channel fd，sshd 不关闭通道 → paramiko 读取永久阻塞；②Nest 启动耗时 >15 秒而脚本固定等待 9 秒，导致健康检查误判端口未监听。"
fix: "部署脚本后台启动改用 (setsid node ... &) 脱离会话；run() 增加 channel 读取超时保护与异常捕获；启动等待延长并结合 ps/日志二次确认。"
related_files:
  - "banmu-admin/deploy/deploy_scene_grid.py"
  - "BUGS.md"
---

场景网格化部署脚本（banmu-admin/deploy/deploy_scene_grid.py，五阶段：SQL → 游戏服 → admin dist → web dist → 重启校验）首次执行时暴露两个问题：

问题一（阻塞）：执行 `cd <dir> && nohup node fuwuqi.js >> server_stdout.txt 2>&1 < /dev/null & echo LAUNCHED` 后，paramiko 的 `out.read()` 抛 `paramiko.buffered_pipe.PipeTimeout` → `TimeoutError`，脚本整体中断（admin dist 与 web dist 两个阶段未执行）。原因：`nohup ... &` 启动的常驻进程仍继承 ssh channel 的文件描述符，sshd 不关闭通道，exec_command 读取永久阻塞（既有脚本里同样写法此前侥幸未触发，属概率性问题）。

问题二（误判）：脚本 `sleep 9` 后执行 `ss -tlnp | grep :3002` 得到 `PORT_3002_DOWN`，但随后独立诊断显示 admin 进程 pid 5638 正在运行、端口正常 LISTEN、Nest 日志已打印「Nest application successfully started」并在处理用户浏览器的真实请求。原因：Nest 应用启动（模块初始化 + 全量路由映射）实测需 15 秒以上，固定 9 秒等待不足；该误判在本项目历史上已出现过（部署笔记里曾有「sleep 9 可能早于 Nest 监听」的提醒）。

修复：
1. 后台启动改为 `(setsid node xxx.js >> log 2>&1 < /dev/null &)` —— 子 shell + setsid 完全脱离 ssh 会话，通道可正常关闭。
2. `run()` 增加读取超时保护（`out.channel.settimeout(timeout)` + try/except，异常时返回 rc=-1 与 `[read-timeout]` 文本），单条命令异常不再中断整个部署流程。
3. 启动检查等待延长到 9-10 秒，并在结果中标注需结合 `ps` 二次确认（脚本末尾统一输出 3000/3002 监听状态）。

验证：重跑部署五阶段全部完成，输出 DEPLOY_DONE；游戏服 3000（pid 14693）与 admin 3002（pid 5638）均在线；启动命令不再阻塞脚本。

教训：经 ssh 启动常驻进程必须 setsid 脱离会话；远端服务健康检查不能只靠一次 sleep + 端口探测，应结合进程列表与日志尾部确认，且部署脚本要求"单步失败不致命"。
