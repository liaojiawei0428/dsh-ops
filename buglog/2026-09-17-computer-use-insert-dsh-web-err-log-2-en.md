---
date: "2026-09-17T07:06:52.245Z"
symptom: "computer use 两行 insert 后 dsh-web.err.log 报 \"2 entries did not activate ... failed to import\"，cua_driver_native__* 工具未注册（服务本身正常，因为它们是可选行）。"
component: "dsh-personal-hub / dsh-computer-use / app-boot 解析语义"
severity: "major"
status: "fixed"
root_cause: "profile patch 插入行的裸包名由 app-boot boot() 从**配置目录**（profile 目录）解析，而 profile/node_modules 里没有任何 @deepseek-ai/* 包（官方包只对真正依赖它们的包可见），于是两行 insert 都 failed to import。personal-hub 的 reapply 又只把清单 plugins 写成 profile dependencies，没有任何机制声明\"profile 自己需要解析的裸包\"，因此无法通过清单表达这种依赖。"
fix: "1) 新建装载器插件 dsh-computer-use（patch-only bundle row，insert 官方服务 + native 提供方两行）；2) personal-hub 增加清单字段 extraDependencies 并抽出 expectedDependencies helper（reapply/statusReport/validateManifest 三处）；3) personal.local.json 用 link: 指向副本 workspace 包；4) profile/package.json 写入依赖并 pnpm install --force 建立符号链接；5) 重启后三工具实测通过。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-computer-use\\cordis.patch.yml"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.local.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\package.json"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\boot\\app-boot\\src\\index.ts"
---

目标：把官方 computer use 能力装到本机 profile。做法是按 DSH-ops 规范新建装载器插件 dsh-computer-use（脚手架 new-plugin.mjs），其 cordis.patch.yml 用 insert 挂载两行：@deepseek-ai/dsh-computer-use（服务）+ @deepseek-ai/dsh-experimental-computer-use-cua-driver-native（提供方）。选 native 提供方是因为 npm 依赖 @trycua/cua-driver@0.28.0 及其 win32-x64-msvc 平台包已在副本依赖树里（.pnpm 下），无需安装外部 CLI。

第一次重启后失败：err.log 出现 "warning: 2 entries did not activate / computer-use (@deepseek-ai/dsh-computer-use): failed to import"（两行都是）。因为它们是可选行，服务本身正常启动（这正是官方 consumer-owned-startup-strictness 设计的效果：只有 required id 失败才拒绝启动）。

根因定位（读源码而非猜测）：app-boot 的 boot() 文档注释（packages/boot/app-boot/src/index.ts:838-841）明确写「relative entry names resolve against the config directory; **bare package names resolve there by default** or against an explicit bareModuleBaseUrl for closed packaged runtimes」。即 profile patch 插入行的裸包名从**配置目录**（profile）解析，而 profile/node_modules/@deepseek-ai/ 是空目录——官方包只对「真正安装了它们的包自己」可见（副本 workspace 的 node_modules 或安装锚点）。bundle 名能解析是因为 resolveBundleDir 走的是另一条路径（安装锚点）。诊断也验证过：从副本根 import 这些包成功，说明不是包本身的问题，纯解析上下文问题。

修复（两处）：

1) personal-hub 新增清单字段 extraDependencies，让 profile 能声明"自己必须解析的裸包"：
   - 抽出 expectedDependencies(manifest) helper（插件 link + extraDependencies），reapply 与 statusReport 共用（否则 statusReport 会把它们当"多出非清单项"报漂移）
   - validateManifest 增加对象形态与字符串值校验
2) personal.local.json 声明两条 link: 指向运行副本的 workspace 包（机器特定绝对路径，符合该文件的分层定位）：
   @deepseek-ai/dsh-computer-use → link:E:/DSH/DSH-ops/Deepseek_DSH/packages/computer-use/computer-use
   @deepseek-ai/dsh-experimental-computer-use-cua-driver-native → link:.../packages/experimental/computer-use-cua-driver-native

过程中踩到两个坑，一并记录：

- **改插件后必须先重启再调用其工具**：第一次 personal_hub_reapply 报"复检无漂移"但 profile/package.json 里根本没有 extraDependencies —— 因为服务进程里跑的仍是旧版 personal-hub 代码（不认识新字段）。这与 2026-09-17 早先 gitconfig 修复时踩的是同一模式（服务进程内已加载的旧代码 ≠ 磁盘上的新代码）。正确顺序：改插件 → 重启 → reapply。
- **pnpm install 对新增 link: 依赖报 "Already up to date" 且不建立符号链接**：lockfile 已正确更新（importers 段含两条 link），但 node_modules/@deepseek-ai 仍为空；必须 `pnpm install --force` 才生成链接（nodeLinker: hoisted）。为省一次重启，本次是手工把两条依赖写进 profile/package.json 后 install，其输出与新版 reapply 一致。

验证：err.log 由 "2 entries did not activate" 变为空；personal_hub_status 无漂移（新代码认得 extraDependencies）；health-check 全绿（13 bundles、闸门 11/11、回归 T1–T4）；三个工具实测可用——check_permissions 返回 UIA/PostMessage 均可用、list_windows 列出 16 窗口/12 应用、get_window_state 读出资源管理器窗口 102 个元素（文件名/日期/大小/可执行动作齐全）。

附带发现（非缺陷）：check_permissions 报 "Process integrity level: High (RID 0x3000, elevated)"，即 DSH 服务以高完整性/管理员权限运行；UIPI 方向对我们有利（高完整性可操作低完整性窗口），但也意味着 computer use 具备操作管理员级窗口的能力，风险面更大。另：当前会话模型 deepseek-v4.1-flash 不声明图像输入，get_window_state 返回的截图对模型不可见（原始图像仅程序化调用方可得），故纯视觉寻址暂不可用，结构化 ax 寻址完全可用。
