# 插件显示名与说明 —— 中文文案映射表（已落地）

## 用途与维护方式

**用途**：本文件是「DSH Web GUI 插件管理页给每个插件显示中文名称 + 中文说明」这件事的**文案唯一来源**。它回答一个问题——19 个 bundle 分别应该显示成什么中文名、什么中文说明，以及**每一句文案的依据在哪里**。运行时真正生效的那份表在 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY`（见下节「实现方式」），本文件是它的台账与取证记录；**改文案时两处都要改**。

**背景（当前显示规则，已核实）**：`packages/client/ui-plugin-manager/src/client/presentation.ts` 的 `packageText()`（第 76–83 行）只对 `BUILTIN_COPY`（第 12–22 行）里登记的 3 个包给中文，其余一律回退为 `shortName(包名)` 当标题、`package.json` 的 `description` 当说明。`shortName()`（第 65–68 行）会先剥掉 scope（`@deepseek-ai/`）、再剥掉 `dsh-`（含可选 `host-` / `client-`）前缀，所以 `@deepseek-ai/dsh-base` 显示为 `base`、`dsh-tool-python` 显示为 `tool-python`。

## 实现方式（2026-09-18 落地）

**标题无法免 patch 修改**，这是官方设计决定的：`packageText()` 对非内置包一律用 `shortName(pkg.name)` 当标题，而 `BundleInfo`（`packages/boot/plugin-manager/src/types.ts:33-53`）与 `PackageView`（`ui-plugin-manager/src/client/manager-store.ts:67-82`）**都没有** title/label/displayName 字段，包名本身也不能是中文；`plugins.item` 那个 slot 的契约是「在官方组里**新增**一个卡片」（`PluginManagerPage.tsx:341` 用它渲染官方配置页条目），覆盖不了已有卡片。**说明**（description）则零 patch 可改——它直接来自各包 `package.json` 的 `description`（`types.ts:36-37` → `manager-store.ts:296` → `presentation.ts:81`），11 个个人插件的说明已于同日改为中文。

所以采用「**一条最小 patch + 一张个人侧的表**」：

| 环节 | 位置 | 作用 |
|---|---|---|
| patch | `official-patches/apply-patches.mjs` 内两条，目标 `packages/client/ui-plugin-manager/src/client/presentation.ts` | ① 在 `packageText()` 的 `BUILTIN_COPY` 判断**之后**插入「查部署覆盖表」；② 在 `shortName()` 之后追加 `deploymentCopy()` 读取器。**补丁内不含任何文案字符串** |
| 数据 | `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY` | 17 条 `包名 → [中文名, 卡片说明]`；`apply()` 里发布到 `globalThis.__DSH_PLUGIN_COPY__`，并注册 `ctx.effect` 在卸载时清除 |

**为什么表放在个人插件而不是 patch 里**：官方有 `verify-client-ui-i18n` 门禁，要求 client UI 文案一律走 locale 字典。patch 若内嵌中文会被判 red；把文案留在个人插件侧、patch 只加「读全局表」的逻辑，既过门禁，也让改文案不必重放 patch。实测 `pnpm run verify-client-ui-i18n` 通过（695 个文件）。

**为什么覆盖表排在 `BUILTIN_COPY` 之后**：Agent Teams 两包的官方中文文案跟随界面语言，优先级高于本表，因此这两包**刻意不入** `BUNDLE_COPY`（入了也不生效）。

**改动后必须重建**：`presentation.ts` 属官方 client 包，registry 服务的是产物而非源码，改完必须执行
`pnpm --filter @deepseek-ai/dsh-client-ui-plugin-manager bundle`
否则改动不进 `lib/client.js`。个人插件的 `client.js` **没有** `lib/`，`exports["./client"]` 直接指向源文件，**只需重启服务**即可生效。

**已知代价与风险**：
- 官方 client 包在 per-file 100% 覆盖率门禁内，本地 `pnpm run test:coverage` 会因 `deploymentCopy()` 的新分支未被官方测试覆盖而红；官方 CI 不受影响。这是本地补丁的可接受代价。
- 官方升级后由 `sync-official.ps1` / `bootstrap-personal.ps1` 自动重放该 patch；若官方重写了 `packageText()`，patch 的 `old` 锚点失配会 fail-loud（有意设计，防静默漏补）。
- **时序**：表由 `dsh-plugin-guide` 的 client half 在 `apply()` 时发布。插件生效与页面渲染都在服务重启之后，正常路径下页面打开时表已就位；但若浏览器里留着**重启前就已打开**的插件页，需刷新一次才能看到中文名。

**维护方式**：
1. 新增／移除 bundle 时，同步增删本表行与 `BUNDLE_COPY` 条目，并更新「附录 A」的状态快照。
2. 官方 DSH 升级后必须复核「类型 = 官方」的行：官方 `README.zh.md` 与 `packages/client/ui-plugin-manager/src/client/locales.ts` 的中文措辞可能变化，本表须重新取证，不得沿用旧句。
3. 改任何一句文案，**必须同步改「依据来源」列**；依据列写不出处（文件 + 行号 / 字段名）的文案，视为不合格，退回标注「待确认」。
4. **「卡片短文案」列必须按「卡片一行放得下」来写**：插件管理页卡片的 `.cardDesc` 强制单行截断（`packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css` 第 257–265 行 `-webkit-line-clamp: 1`，13px/18px），且 `PluginManagerPage.tsx` 第 249–270 行的 `CardHead` 没有 `title` 属性——**截断后用户看不到全文**。详情页 `.detailDesc`（同文件第 923–928 行）虽不限行，但 `packageText()` 只返回一个 description 供两处共用，故**以短版为准**：建议 ≤ 30 个汉字；含拉丁标识符时按渲染宽度折算（1 个汉字 ≈ 2 个拉丁字符，即整行约 60 个宽度单位）。`BUNDLE_COPY` 里存的即该列，「建议中文说明」列保留为完整版台账。
5. 本表自 2026-09-18 起**就是运行时来源的台账**：改文案要同时改 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY` 与本表，两者不一致视为缺陷。
6. **新增插件后必须跑 `node check-plugin-copy.mjs`**（已并入 `health-check.py` 的「插件中文文案」段）：它比对 profile 的 `dsh.profile.bundles` 与本表，缺中文名的 bundle 逐条列出并 exit 1。漏加条目不报任何错，界面只会静默显示英文短名，所以这道检查是必需的防线。

## 新增插件时的标准动作（沿用本套中文标准）

**说明是自动的，中文名是手动的**——这是两者唯一的差别，也是最容易漏的一步：

| 步骤 | 动作 | 生效方式 |
|---|---|---|
| 1 | 新插件的 `package.json` 写中文 `description` | ✅ 自动——插件管理页与详情页直接读它，重启后生效 |
| 2 | 在 `plugins/dsh-plugin-guide/client.js` 的 `BUNDLE_COPY` 加一行 `'包名': ['中文名', '卡片短文案']` | ❌ 手动 |
| 3 | 在本文件主表加一行台账（含依据来源与卡片短文案） | ❌ 手动 |
| 4 | 跑 `node check-plugin-copy.mjs` 确认无缺口 | — 防线 |

第 2 步漏了不会报错：插件管理页只会静默显示 `shortName(包名)` 那样的英文短名。第 4 步就是为这个漏点设的，已接入一键体检（`health-check.cmd` 的「插件中文文案」段）。

**为什么第 2 步不做成全自动**：官方 `BundleInfo` 与 `PackageView` 都没有自定义名称字段（见上节「实现方式」），个人侧的表是一段静态字面量，而浏览器端读不到文件系统。要自动化就得再叠一层 Host 侧扫描 + RPC，把表从插件的 `package.json` 动态读出来。新增插件是低频事件，为此增加一条跨 Host/Client 的取数通道不划算；用第 4 步的检查兜住漏报已经足够。

**取证口径**：`plugin_manager` 工具 `action: list_bundles`（一次调用即返回全部 19 个 bundle，`total: 19`，无需翻页）+ `C:\Users\Administrator\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles`（15 项）+ 各包 `README.zh.md` / `package.json` 的 `description`。取证时间：2026-09-18 之后的当前工作树。

---

## 一、中文文案映射表（19 个 bundle，与 `list_bundles` 逐一对应）

排序：先按 `dsh.profile.bundles` 声明顺序（第 1–15 行），再列未写入清单、当前 `enabled: false` 的 4 个官方可选包（第 16–19 行）。

| 包名 | 类型 | 当前显示名 | 建议中文名 | 建议中文说明 | 卡片短文案 | 依据来源 |
|---|---|---|---|---|---|---|
| `@deepseek-ai/dsh-base` | 官方基座 | `base` | DSH 核心基座 | 共享的 dsh 核心：为每个 `dsh --profile` 表层提供模型访问、工具、持久会话与安全默认值。 | 所有 dsh profile 共享的核心：模型、工具、持久会话与安全默认值 | `packages/bundle/base/README.zh.md` frontmatter `description`；`package.json` description（英文） |
| `@deepseek-ai/dsh-web-app` | 官方基座 | `web-app` | Web 界面基座 | dsh 的浏览器 GUI：交互式聊天、模型与设置管理、会话历史。启动时打印带认证信息的 URL。 | dsh 的浏览器 GUI：聊天、模型与设置管理、会话历史 | `packages/bundle/web-app/README.zh.md` frontmatter `description` + 「概述」首句 |
| `dsh-locale-language` | 自研 | `locale-language` | 界面语言 | 全局提示词指令：让模型的思维链与回复跟随 DSH 界面语言（中／英），语言切换下次请求即生效、无需重启。 | 全局提示词指令：思维链与回复跟随界面语言 | `plugins/dsh-locale-language/package.json` description；`index.js` 头部 JSDoc（第 1–12 行：GLOBAL system-prompt section + locale 设置实时读取）。中文名沿用 `dsh-plugin-guide` GUIDE 字典 |
| `dsh-deepseek-balance` | 自研 | `deepseek-balance` | 余额胶囊 | 在作曲器下方的个人工具栏显示两个胶囊：DeepSeek 账户余额（5 分钟自动刷新，≤¥10 橙色警示）与 DSH 版本（每小时检查更新，可一键更新）。 | 作曲器下方个人胶囊行的余额与 DSH 版本两个胶囊 | `plugins/dsh-deepseek-balance/README.md` 首段 + 其 `package.json` description（2026-09-18 已由 Lead 修正为「作曲器下方个人胶囊行的余额与 DSH 版本两个胶囊」，见附录 B-1）。中文名沿用 GUIDE 字典 |
| `dsh-tool-python` | 自研 | `tool-python` | Python 工具 | 面向模型的 Python 3 执行工具（走 shell 通道，本机默认计算入口）。 | 面向模型的 Python 3 执行工具 | `plugins/dsh-tool-python/package.json` description；README 首段。中文名沿用 GUIDE 字典 |
| `dsh-bug-log` | 自研 | `bug-log` | BUG 知识库 | 持久化 BUG 知识库：`bug_report` / `bug_search` / `bug_stats` 三个工具 + 排查前召回提示 + 漏记启发式提醒。 | 持久化 BUG 知识库：记录与检索，排查前自动召回 | `plugins/dsh-bug-log/package.json` description；README 首段。中文名沿用 GUIDE 字典 |
| `dsh-personal-hub` | 自研 | `personal-hub` | 个人配置器 | 个人部署层：按声明式清单重建 web profile 的依赖、bundles 与 patch 托管条目（清单外项只补不删）。 | 个人部署层：按声明式清单重建 profile 依赖与 bundles | `plugins/dsh-personal-hub/package.json` description；README 首段。中文名沿用 GUIDE 字典 |
| `dsh-personal-bar` | 自研 | `personal-bar` | 个人胶囊行 | 作曲器下方的个人插件胶囊行容器：声明 `dsh.personal.bar` 子槽位，独占一行并支持自动换行扩展。 | 作曲器下方的个人插件胶囊行容器 | `plugins/dsh-personal-bar/package.json` description；README 首段。GUIDE 字典无此条，中文名新拟 |
| `dsh-plugin-guide` | 自研 | `plugin-guide` | 插件说明 | 「设置 → 插件」中的中文插件开发指南标签页：可搜索的模块中文名与一句话功能清单。 | 「设置 → 插件」中的中文插件说明页 | `plugins/dsh-plugin-guide/package.json` description；README 首段。中文名沿用 GUIDE 字典 |
| `dsh-restart-resume` | 自研 | `restart-resume` | 重启续聊 | 重启后自动续聊：`request_restart` 经独立进程重启 DSH 服务，完成后自动向原会话回发继续消息。 | 重启 DSH 服务后自动向原会话续聊 | `plugins/dsh-restart-resume/package.json` description；README 首段。GUIDE 字典无此条，中文名新拟 |
| `dsh-server-ssh` | 自研 | `server-ssh` | SSH 服务器 | 在 GUI 里配置 SSH 远程主机；全部会话即可通过 `ssh_*` 工具读写该服务器。 | 在 GUI 里配置 SSH 主机，会话经 `ssh_*` 工具访问 | `plugins/dsh-server-ssh/package.json` description；README 首段。GUIDE 字典无此条，中文名新拟 |
| `dsh-github-push` | 自研 | `github-push` | GitHub 推送 | 把本地项目目录绑定到 GitHub 仓库，由用户手动触发一键推送（`add` → `commit` → `push`），不做定时任务。 | 把本地目录绑定到 GitHub 仓库，手动一键推送 | `plugins/dsh-github-push/package.json` description；README 首段。GUIDE 字典无此条，中文名新拟 |
| `dsh-computer-use` | 自研 | `computer-use` | 计算机操作 | 把官方 computer-use（计算机操作）服务与 Cua Driver 原生 provider 挂载到本机 profile；自身不含运行时代码，作用全在 `cordis.patch.yml`。 | 挂载官方计算机操作（Computer Use）能力 | `plugins/dsh-computer-use/package.json` description；README 首段。GUIDE 字典无此条，中文名依据 README 措辞 |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | 官方可选 | 智能体团队（**已是中文**） | 智能体团队（无需改动） | 启用智能体团队协作与团队工具。 | 启用智能体团队协作与团队工具。 | `packages/client/ui-plugin-manager/src/client/locales.ts` 第 19–20 行（`builtinAgentTeamTitle` / `Description`，官方既有中文文案，任务要求原样沿用） |
| `@deepseek-ai/dsh-experimental-agent-team-web-profile` | 官方可选 | 智能体团队 Web 界面（**已是中文**） | 智能体团队 Web 界面（无需改动） | 在浏览器中查看团队成员、任务看板和成员会话。 | 在浏览器中查看团队成员、任务看板和成员会话。 | `packages/client/ui-plugin-manager/src/client/locales.ts` 第 21–22 行（`builtinAgentTeamWebTitle` / `Description`，官方既有中文文案，任务要求原样沿用） |
| `@deepseek-ai/dsh-acp-app` | 官方可选 | `acp-app` | ACP 自动化应用 | 纯自动化 ACP（Agent Client Protocol）stdio 应用 profile，供需要启动持久 harness 智能体的用户与维护者使用。 | 纯自动化 ACP stdio 应用 profile，用于启动持久智能体 | `packages/bundle/acp-app/README.zh.md` frontmatter `description` + 「概述」首段 |
| `@deepseek-ai/dsh-headless` | 官方可选 | `headless` | 一次性任务模式 | 从命令行运行单个 dsh 任务并打印最终答案后退出——没有 GUI、没有服务器、没有浏览器，适合脚本、CI 与一次性任务。 | 命令行跑单个任务并打印最终答案后退出 | `packages/bundle/headless/README.zh.md` frontmatter `description` + 「概述」首段 |
| `@deepseek-ai/dsh-sdk-app` | 官方可选 | `sdk-app` | SDK 应用 | SDK stdio 应用 profile：以 `dsh-base` 为基础提供 stdio JSON-RPC 服务与进程生命周期。 | SDK stdio 应用 profile：JSON-RPC 服务与进程生命周期 | `packages/bundle/sdk-app/README.zh.md` frontmatter `description`；`package.json` description（英文） |
| `@deepseek-ai/dsh-sdk-minimal` | 官方可选 | `sdk-minimal` | 极简 SDK | 独立极简 SDK profile：JSON-RPC、一个 DeepSeek 适配器、持久 shell 与 JSONL 会话；刻意排除 `dsh-base`、Web 与 settings。 | 独立极简 SDK profile：JSON-RPC 与 JSONL 会话 | `packages/bundle/sdk-minimal/README.zh.md` frontmatter `description` + 「概述」首段；`package.json` description（英文） |

**覆盖率**：19 / 19，与 `plugin_manager list_bundles` 的 `total: 19` 完全一致，无遗漏。其中 **2 个已是中文**（Agent Teams 两包，无需改动），**17 个当前为英文或裸 shortName、待补中文**。

---

## 二、附录 A：盘点状态快照

数据来自 `plugin_manager`（`action: list_bundles`）与 profile 清单，用于核对「一个都没漏」。

| 包名 | version | 在 `dsh.profile.bundles` | enabled | installed | removable | readOnlyReason | rows 数 |
|---|---|---|---|---|---|---|---|
| `@deepseek-ai/dsh-base` | 0.1.6-alpha.2 | 是 | true | false | false | `management-required` | 89 |
| `@deepseek-ai/dsh-web-app` | 0.1.6-alpha.2 | 是 | true | false | false | `management-required` | 74 |
| `dsh-locale-language` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-deepseek-balance` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-tool-python` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-bug-log` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-personal-hub` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-personal-bar` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-plugin-guide` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-restart-resume` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-server-ssh` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-github-push` | 0.1.0 | 是 | true | true | true | — | 1 |
| `dsh-computer-use` | 0.1.0 | 是 | true | true | true | — | 2 |
| `@deepseek-ai/dsh-experimental-agent-team-profile` | 0.1.6-alpha.2 | 是 | true | false | false | — | 2 |
| `@deepseek-ai/dsh-experimental-agent-team-web-profile` | 0.1.6-alpha.2 | 是 | true | false | false | — | 1 |
| `@deepseek-ai/dsh-acp-app` | 0.1.6-alpha.2 | **否** | false | false | false | — | 2 |
| `@deepseek-ai/dsh-headless` | 0.1.6-alpha.2 | **否** | false | false | false | — | 2 |
| `@deepseek-ai/dsh-sdk-app` | 0.1.6-alpha.2 | **否** | false | false | false | — | 2 |
| `@deepseek-ai/dsh-sdk-minimal` | 0.1.6-alpha.2 | **否** | false | false | false | `management-required` | 32 |

**rows 口径**：上表「rows 数」= `list_bundles` 返回的 `rows` 数组长度（该 bundle 声明的组件行数），已逐条核对、无重复项，19 个 bundle 合计 **216** 行。其中 11 个自研插件合计仅 12 行（10 个各 1 行 + `dsh-computer-use` 2 行），`dsh-base`(89) + `dsh-web-app`(74) 两个官方基座占了 163 行。

**清单差集**：profile 的 `dsh.profile.bundles` 只有 15 项，比 `list_bundles` 的 19 项少 4 个——即 `acp-app` / `headless` / `sdk-app` / `sdk-minimal`。这 4 个是**官方随发行版提供的可选 profile bundle，当前全部 `enabled: false`**，由插件管理页列出但不写入用户清单。（另注：`@deepseek-ai/dsh-computer-use` 与 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` 出现在 profile 的 `dependencies` 中，是 `dsh-computer-use` 经 patch 引入的行，本身不是独立 bundle，故不入表。）

---

## 三、附录 B：待确认与不确定之处（**请勿把这些当成已定稿文案**）

### B-1 `dsh-deepseek-balance` 的 description 曾与 README 矛盾 —— ✅ **已修复（2026-09-18）**
- 原 `package.json` description 写「会话头部显示 DeepSeek 账户余额胶囊」，与 README（作曲器下方个人胶囊行、**两个**胶囊）不符；Lead 核实其英文原文本身即写错「会话头部」，属上一轮引入的错误。
- **Lead 已修正为**：「作曲器下方个人胶囊行的余额与 DSH 版本两个胶囊」。
- 本表第 4 行已同步：依据来源改指「README 首段 + 修正后的 description」，「卡片短文案」直接采用该定稿。

### B-2 `dsh-plugin-guide` 既有 GUIDE 字典两条说明与插件实际功能不符 —— ✅ **已修复（task-3）**
- 第 188 行原把 `locale-language` 说明为「通用设置里的界面语言切换行（个人插件）」——「界面语言切换行」是**官方**设置功能，本插件实际是注入全局提示词指令让模型输出跟随界面语言（依据 `plugins/dsh-locale-language/index.js` 第 1–12 行 JSDoc 与其 `package.json` description）。**已改为**「注入全局提示词指令，让思维链与回复跟随界面语言（个人插件）」。
- 第 189 行原把 `deepseek-balance` 说明为「会话头部显示 DeepSeek 账户余额与版本胶囊（个人插件）」——与 B-1 同源的「会话头部」错误。**已改为**「作曲器下方的个人胶囊行显示 DeepSeek 余额与 DSH 版本两个胶囊（个人插件）」。
- 改动经验证：`node --check` 通过、diff 仅这两行、`validate-plugins.mjs` 11/11 PASS；字典条目数仍为 151、key 仍为 `shortName()` 形式、无残留 TODO。
- 附注：task-3 描述曾把依据写作「`index.js` 头部 JSDoc 与 README.md」，但 `dsh-locale-language` 目录下**并无 README.md**（只有 `cordis.patch.yml` / `index.js` / `package.json`）；实际依据为 JSDoc + `package.json` description。

### B-3 官方 8 包的「建议中文名」属新拟，官方无既有中文名
`dsh-base`、`dsh-web-app`、`acp-app`、`headless`、`sdk-app`、`sdk-minimal` 这 6 个在官方 `README.zh.md` / `locales.ts` 中**只有中文说明，没有中文短名**。本表给出的「DSH 核心基座」「Web 界面基座」「ACP 自动化应用」「一次性任务模式」「SDK 应用」「极简 SDK」是依据各自 `README.zh.md` 的核心措辞新拟的，**需用户／团队拍板**；唯一有官方既有中文名的是 Agent Teams 两包（智能体团队／智能体团队 Web 界面），已按要求原样沿用。

### B-4 ~~说明文案的长度未受约束~~ —— ✅ **已核实：卡片强制单行截断（已落实）**
- Lead 已核实并给出证据：`PluginManagerPage.module.css` 第 257–265 行 `.cardDesc` 带 `-webkit-line-clamp: 1`（13px/18px），卡片说明**只能显示一行**、超出省略号；`.detailDesc`（同文件第 923–928 行，14px/22px）不限行，但 `packageText()` 只返回**一个** description 供两处共用，且 `PluginManagerPage.tsx` 第 249–270 行的 `CardHead` 无 `title` 属性——**截断后用户看不到全文**。
- 上述行号均已由本任务独立复核。
- **已落实**：「维护方式」新增第 4 条约束；主表新增「卡片短文案」列，19 行全部给出（其中 Agent Teams 两行官方文案本就达标，原样保留）。
- 补充口径提醒：**判据不是单纯的汉字数**。含长拉丁标识符的行（如 `dsh-bug-log` 仅 24 汉字，但 `bug_report` / `bug_search` / `bug_stats` 使渲染宽度达 105 单位 ≈ 1.7 行）同样必然截断，故 19 行的短文案一律给出而非只补超标行。

### B-5 4 个 disabled 官方可选包是否需要中文
`acp-app` / `headless` / `sdk-app` / `sdk-minimal` 当前 `enabled: false` 且不在用户 profile 清单内。既然插件管理页会把它们列在「官方」分组里，本表按「一并给中文」处理；若产品上决定不展示未启用包，这 4 行可整段删除。

### B-6 未纳入本表的相邻项（避免与团队其他任务混淆）
- `@deepseek-ai/dsh-experimental-auto-review`：`presentation.ts` 的 `BUILTIN_COPY` 第 19–21 行已登记中文（「自动授权审查」/「提供自动审查权限模式，由模型在每次工具调用前判断是否授权。」），但**本机 profile 未安装**，故不在 19 个 bundle 内、不入表；将来启用时可直接沿用官方文案。
- `dsh-opencode-session-id`：存在于 `E:\DSH\DSH-ops\plugins\` 但**不在 profile bundles**，其 description 自述「（已弃用）」，同样不入表。
- GUIDE 字典另有 151 条**组件级（row 级）**中文名（`dsh-base` / `dsh-web-app` 内部的各模块），与本次的 bundle 级显示名是**两个层级**；本表只负责 bundle 级 19 条，不与之混用。

---

## 四、附录 C：与 `dsh-plugin-guide` GUIDE 字典的对齐关系

`plugins/dsh-plugin-guide/client.js` 的 `GUIDE` 字典 key 恰好是 `shortName()` 形式（如 `tool-python`、`bug-log`），与插件管理页标题同源，是本表**名称列的首选对齐对象**。精确比对结果：

| 情况 | 数量 | bundle |
|---|---|---|
| GUIDE 已收录、名称直接沿用 | 6 | `dsh-locale-language`、`dsh-deepseek-balance`、`dsh-tool-python`、`dsh-bug-log`、`dsh-personal-hub`、`dsh-plugin-guide` |
| GUIDE 未收录、名称本表新拟 | 13 | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`dsh-personal-bar`、`dsh-restart-resume`、`dsh-server-ssh`、`dsh-github-push`、`dsh-computer-use`、Agent Teams 两包（官方 locale 已有）、`acp-app`、`headless`、`sdk-app`、`sdk-minimal` |

> 说明：GUIDE 字典共 151 条，绝大多数是组件级条目，与 19 个 bundle 只有上述 6 条交集。因此本表不是 GUIDE 的副本，而是**同层级（bundle 级）的补全**。
