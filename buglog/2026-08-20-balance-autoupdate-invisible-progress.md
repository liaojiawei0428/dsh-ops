---
date: "2026-08-20T05:23:57.711Z"
symptom: "点击右上角\"有新版本\"后仅胶囊显示\"正在更新…\"，更新过程（git 拉取/依赖下载/构建）完全无进度可见，用户不清楚发生了什么。"
component: "dsh-deepseek-balance"
severity: "minor"
status: "fixed"
root_cause: "launchUpdater 以 windowsHide: true + stdio ignore + detached 启动更新进程，git/pnpm/build 全部输出进入 NUL 且无任何窗口，用户只能看到胶囊的静态\"正在更新…\"文案，更新耗时 2-5 分钟期间完全不可观测，失败也无从得知卡在哪一步。"
fix: "launchUpdater 重写为 cmd.exe /d /c start \"\" &lt;目标&gt; 弹出可见终端窗口：pwsh 经 PATH 可达时窗口直接运行 更新DSH.bat（与手动双击完全一致：成功约 3 秒自关、失败 pause 保留错误）；仅 override/默认路径可达时用绝对 pwsh 路径运行 update-dsh.ps1。窗口 stdio 指向新控制台本身，git 拉取/依赖安装/构建进度全程可见。DSH_UPDATE_SOURCE=auto 经环境块穿透 start 传递（实测 source=auto 落盘）。成功判定收紧为 cmd 的 exit 事件（start 完成窗口创建）而非 spawn 事件，窗口打不开时如实返回失败。client.js 胶囊提示同步改为\"已弹出更新终端窗口\"。验证：闸门 4/4 PASS、node --check 通过、node 运行时实测 spawn→start→窗口内 bat 执行→标记文件出现全链路成功（首次 node 测试失败系测试脚本 spawn 后立即 process.exit 的时序问题，DSH 服务进程长存不受影响）。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\README.md"
---

(No additional details recorded.)
