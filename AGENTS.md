# AGENTS.md — DSH-ops 工作区指令

本仓库维护 DSH 的运维脚本、自研插件（`plugins/`）与插件行为准则。

## 强制准则（不可绕过）

开发或修改任何 DSH 插件、profile、启动链脚本之前，必须先读
[PLUGIN-STANDARD.md](PLUGIN-STANDARD.md) 并完整遵守它。要点：

1. **新插件一律从脚手架开始**：`node new-plugin.mjs dsh-<role>`，不手写骨架。
2. **零 workspace import**（不得 import 任何 `@deepseek-ai/*`），注入最小化，注册全包 `ctx.effect`。
3. **schema 方言**：`required` 只能是父对象上的字符串数组，属性内部、`oneOf` 旁禁止出现（13:05 事故）。
4. **安装前闸门必须全绿**：`node validate-plugins.mjs`（八项检查见 G1/G2：注册路径含 inject 守卫、schema 方言、client 语法、exports 在盘、dsh.bundle 声明、安装状态、演练保留区）；红了就修，不许带病安装。
5. **改动 .ps1 后**：语法检查 + 补回 UTF-8 BOM + 确认无 `powershell.exe`（恒用 pwsh 7）。
6. **用户数据文件**（`~/.dsh` 下）：改前备份到 `backups/`，整体原子重写，禁止行级拼接。
7. **坏插件应急**：`node disable-plugin.mjs dsh-<role>` 一键摘除（文件与 link 保留），修复后加回 bundles。启动链自带兜底（G3）：3 次启动失败自动隔离肇事插件并重试一轮；服务运行期死亡由看门狗（G5，`watchdog-dsh.ps1`）60 秒内自动定位+隔离+拉起；详见 PLUGIN-STANDARD.md「闸门与启动保险（G1–G5）」。
8. **主仓库更新**只走 `update-dsh.ps1`，不手工跳步。
9. **工具分工**（D7）：默认用 `python` 工具——计算、数据处理、日志/文本读写、JSON、多步逻辑；pwsh 仅限系统对象（服务/进程/端口/WMI）、`git`/`pnpm`/`node`、执行 `.ps1`。查状态先跑 `E:\DSH\DSH-ops\health-check.cmd`（或 `pwsh -NoProfile -File E:\DSH\DSH-ops\health-check.ps1`，内部自动定位真实 python，规避命令行裸 `python` 解析到 MS Store 桩；一键体检：服务/看门狗/日志/闸门/回归），不要再裸写 pwsh、也不要再手敲 `python health-check.py`。本准则已固化到用户全局 `~/.dsh/AGENTS.md`（DSH 指令加载器对所有项目的会话注入）；两处以 PLUGIN-STANDARD.md D7 为唯一权威版本，改动须三处同步。

改动完成后运行 `node test-standard.mjs` 确认工具链保障未回归。

## BUG 记录（强制，P11）

修复任何 BUG 后必须立即调用 `bug_report` 记录（症状/根因/修复/组件/严重度/状态）；排查异常前先 `bug_search`。记录落 `buglog/`，详见 [PLUGIN-STANDARD.md](PLUGIN-STANDARD.md) P11。未记录的修复视为任务未完成。

## 重启 DSH 服务标准流程（AI 必读）

需要重启 DSH 服务（装插件、改配置、版本更新）时，**一律调用 `request_restart` 工具**，不要手动跑 `start-dsh-web.ps1 -Restart`。它会自动安排续聊，重启完成后你会收到继续消息。铁律：调用后**立即结束当前回复、不要再调用任何工具**（服务数秒内停止，宿主进程随之死亡）。完整 SOP、失败排查路径与历史坑（pwsh detached 静默退出、宿主 Job 连带杀子进程、WMI 中继方案）见
[plugins/dsh-restart-resume/README.md](plugins/dsh-restart-resume/README.md)，对应 buglog 检索关键词 `restart-resume`。

**浏览器只由一个来源打开**：`start-dsh-web.ps1` 启动服务时带 `--no-open`，关掉 `dsh web` 自带的浏览器交接（`web-app` 的 `openBrowser` 默认 true），页面统一由该脚本从 `dsh-web.log` 取带 token 的地址开一次。**不要去掉 `--no-open`，也不要再往启动链里加第二处开浏览器的调用**——两个互不感知的来源各开一次，正是「重启/启动弹两个 Web 页面」的根因（buglog 关键词 `dsh-restart-two-web-pages`）。

## 个人界面元素（胶囊行）—— 修复必读

作曲器下方的**个人插件胶囊行**（SSH / GitHub / 余额 / DSH版本）与官方元素共享同一个官方 slot，只有靠一条对官方 CSS 的补丁才能独占一行。**凡遇到「胶囊消失 / 挤在一起 / 位置不对」，先读
[PERSONAL-CAPSULES.md](PERSONAL-CAPSULES.md)**：内含位置与官方的区分方式、依赖链（容器 `dsh-personal-bar` → 子 slot `dsh.personal.bar` → 三个消费者插件）、官方更新时的脆弱点、逐症状的诊断与修复步骤、以及历史故障模式。

两条最容易踩的坑：**① client 侧改动（官方 CSS 或插件 client.js）必须 `pnpm run build` 重建 bundle 才进产物；② 重启服务不会让浏览器重新加载 client bundle——验证任何 client 侧改动前必须刷新页面。**

## 个人部署层（personal-hub）与官方插件管理器 —— 边界必读

`~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` **有两个写入方**：`dsh-personal-hub`（按 `personal-hub/personal.json` 声明式重建）与官方插件管理器（0.1.6-alpha.2+ 的侧边栏 Plugins 面板 / `plugin_manager` 工具，GUI 交互式启停）。**GUI 操作不回写清单。**

因此 reapply 的语义是**只补不删**：清单缺项 → 补齐（才算漂移）；**清单外 bundle → 原样保留**，仅在设置页作提示（走 `notes` 通道，不影响 `ok`）。要真正移除某插件，必须写进清单的 `removedBundles`，或用 `disable-plugin.mjs`——**把插件从清单里删掉并不会让它从 profile 消失**。

- 新增官方可选/实验层（如 Agent Teams 的两个包）请写进清单的 **`extraBundles`**（声明顺序排在自研插件之后 = patch 层叠最上层），不要只留在 profile 里。
- 排查"某功能突然消失"先跑 `personal_hub_status`：`notes` 出现非清单项即表示 profile 里有清单不知道的 bundle——reapply 现已不会删除它，但仍应补进清单。
- 详见 [plugins/dsh-personal-hub/README.md](plugins/dsh-personal-hub/README.md)。

## 插件显示名与中文文案 —— 手册

插件管理页卡片的**标题**由官方 `packageText()` 从包名派生（`shortName()`），官方未提供任何自定义字段；**说明**则来自各包 `package.json` 的 `description`。因此：

- 改**说明**：只改该插件 `package.json` 的 `description`（个人插件零 patch 即可改；11 个自研插件的说明均为中文）。
- 改**标题**：走 `official-patches` 里针对 `packages/client/ui-plugin-manager/src/client/presentation.ts` 的两条 patch；个人侧文案表在 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY`，运行时发布到 `globalThis.__DSH_PLUGIN_COPY__`。
- **官方 client 改完必须重建**：`pnpm --filter @deepseek-ai/dsh-client-ui-plugin-manager bundle`（个人插件的 `client.js` 无 `lib/`，重启即可，不需要 build）。
- 卡片 `.cardDesc` 是**单行截断**（`-webkit-line-clamp: 1`）且 `CardHead` 没有 `title` 属性——说明必须按「一行放得下」写，超了用户就看不到全文。

19 个包的中文名台账、逐条依据、完整机制与已知代价见 [plugin-display-names.md](plugin-display-names.md)。

**新增插件时**（沿用同一套标准）：`package.json` 的中文 `description` **自动生效**；中文名则**必须手动**加进 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY`——漏加不报任何错，只在页面上静默退回英文短名。所以加完插件要跑一次 `node check-plugin-copy.mjs`（已并入 `health-check.py` 的「插件中文文案」段）：它比对 profile 的 `dsh.profile.bundles` 与 `BUNDLE_COPY`，缺条目即 exit 1 并逐条列出该改哪个文件。

## 目录

- `PERSONAL-CAPSULES.md` — 个人胶囊行的位置、依赖链与修复手册（胶囊相关问题的唯一入口）
- `plugin-display-names.md` — 插件管理页中文名与说明的文案台账、实现机制（patch + 全局表）与已知代价
- `check-plugin-copy.mjs` — 插件中文文案完整性闸门（新增插件漏加中文名即 exit 1）
- `plugins/` — 自研插件（link 安装进 `~/.dsh/profiles/web`）
- `PLUGIN-STANDARD.md` — 行为准则（唯一权威版本）
- `new-plugin.mjs` / `validate-plugins.mjs` / `disable-plugin.mjs` / `test-standard.mjs` — 准则工具链
- `update-dsh.ps1` / `start-dsh-web.ps1` / `watchdog-dsh.ps1` / `check-update.ps1` — 启动、看护与更新链
- `health-check.cmd` / `health-check.ps1`（包装器，自动定位真实 python）→ `health-check.py` — 一键体检（准则 9 的默认入口；看门狗不在岗自动复活）
- `启动DSH.bat` / `更新DSH.bat` — 用户入口

## 注意

- `~/.dsh/backups/` 含密钥，永不提交。
- 本仓库改动由用户审阅后自行提交（dual-track 流程）。
