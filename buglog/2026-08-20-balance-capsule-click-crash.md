---
date: "2026-08-20T05:06:33.463Z"
symptom: "点击右上角版本胶囊\"有新版本\"后，DSH 服务进程直接崩溃退出（Web 页面断连），需手动重启 DSH。"
component: "dsh-deepseek-balance"
severity: "critical"
status: "fixed"
root_cause: "旧版 launchUpdater() spawn 硬编码的不存在路径 'C:\\\\Program Files\\\\PowerShell\\\\7\\\\pwsh.exe' 后立即 unref 并返回，未注册 child 'error' 监听器。Node.js 中 spawn 失败（ENOENT）异步触发 'error' 事件，无监听器时升级为 uncaughtException，进程直接退出——服务崩溃。时序证据：用户点击时运行的是 12:56 修复前的旧代码（进程未重启）；HTTP 先返回 200 ok:true（胶囊短暂显示\"正在更新…\"），随后 error 事件击穿进程。"
fix: "与\"假更新\"同一修复覆盖（index.js 重写 launchUpdater）：(1) resolvePwsh() 动态定位 pwsh 7（DSH_PWSH_PATH → PATH → Program Files），本机命中 E:\\\\GongJu\\\\7\\\\pwsh.exe，spawn 不再 ENOENT；(2) child.once('error') 监听器在位，即使将来 spawn 失败也转为 started:false 如实返回 HTTP 500，绝不触发 uncaughtException。用户 13:04 经正式启动链重启后（闸门 4/4 PASS），运行进程已加载修复代码（index.js 修改时间 12:56:51 早于进程启动 13:04:00，link 插件重启即生效）。教训：插件代码修改后必须重启 DSH 才对运行时生效，修复完成与运行时生效之间存在窗口。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\index.js"
---

(No additional details recorded.)
