# 部署流程跨机兼容性审核（DEPLOY-COMPAT-REVIEW.md）

**审核日期**：2026-09-19
**审核对象**：`E:\DSH\DSH-ops` 的部署链（DEPLOY.md + bootstrap/sync/start/update/watchdog + personal-hub 清单 + config 模板）
**审核问题**：用户在**另一台电脑**上能否部署出**一模一样**的 DSH？
**审核方式**：全部只读（读文件、`node --check`、只读闸门、内存模拟补丁应用）。未修改任何文件，未重启服务，未安装依赖。
**证据口径**：所有"实测"均为本次审核在开发机上真实执行的命令输出；标注「推断」的条目未经实机验证。

---

## 一、结论先行

### 判断：**不能一次部署成功。当前状态下会「部署出一个能跑、但不是同一套」的 DSH。**

具体分三层：

| 层次 | 判断 | 依据 |
|---|---|---|
| **流程设计** | ✅ 设计是合格的 | 机器特定值已被正确隔离进 `personal.local.json` 覆盖层 + 运行时派生；无版本 pin 是设计选择而非缺陷；关键路径全部 fail-loud |
| **交付状态** | ❌ **当前不可交付** | 工作区有 **7 条补丁 + 3 个 buglog 未提交/未推送**，新机 clone 拿不到。且 `git log origin/main..HEAD` 有 **3 个未推送提交** |
| **文档准确性** | ⚠️ 有 3 处与实际不符 | `update-dsh.ps1` 的 DSH_HOME 支持、`config/settings.yaml` 的完整性表述、`start-dsh-web.ps1` 的 DSH_HOME 缺口 |

### 最关键的三个发现

1. **【阻断】交付状态不干净 —— 新机拿到的不是这一套**
   `git status --porcelain` 非空（DEPLOY.md:215 明确要求为空）、`git log origin/main..HEAD --oneline` 有 3 个提交（DEPLOY.md:216 明确要求为空）。
   未提交的 7 条补丁正是「队友可选模型」功能（`agent-team` + `tool-agent-team`）；新机跑出来的 DSH **没有这个功能**。
   另：`buglog/` 3 个新记录也未跟踪。

2. **【阻断】无版本固定机制 —— "一模一样"在时间维度上不成立**
   四处 `git clone --depth 1` 均无 `--branch`/`--tag`/commit pin（`bootstrap-personal.ps1:42,56`、`sync-official.ps1:48`、`update-dsh.ps1:50`），永远取默认分支 HEAD。
   实测：纯净官方 checkout 当前在 `tag: dsh-v0.1.6-alpha.2`（`ddefc45f`），但仓库**存在更高版本 tag**。今天部署与明天部署可能得到不同官方版本。
   → DEPLOY.md:153 的验收项「版本与开发机一致（当前 `0.1.6-alpha.2`）」是**时间相关的运气**，不是保证。

3. **【需手工干预】`config/settings.yaml` 是骨架，不是可用配置**
   实测对比：仓库模板 **7 个顶层键 / 139 行**；开发机实际 `~/.dsh/settings.yaml` **10 个顶层键 / 264 行**。
   模板缺 `shell`、`subagent-model-selection`、`llm-deepseek` 三节。
   DEPLOY.md:128 已诚实说明「照它配出来的不是同一套 DSH」——**文档说对了**，但第 4 步验收清单并未提醒这一点，容易误判为部署成功。

### 一句话回答

**流程本身写得相当扎实（fail-loud、定位链、机器值隔离都到位），但"一模一样"当前做不到**：一是交付物没推干净（7 条补丁 + 3 个提交），二是官方源码不 pin 版本，"同一套"没有可复现的锚点。

---

## 二、逐项证据

### 问题 1：全新 Windows 机器的前置条件是否都在文档里写明？

**答：写明了，且质量较高。** 逐项核对：

| 依赖 | 文档声明 | 位置 | 实测本机 | 判定 |
|---|---|---|---|---|
| Git | 任意现代版，`git --version` | DEPLOY.md:46 | `C:\Tools\Git\cmd\git.exe` | ✅ |
| Node.js | `^22.19 或 >=24`，非默认位置也可 | DEPLOY.md:47 | `C:\Program Files\nodejs\node.exe` | ✅ |
| pnpm | 11+（`corepack enable` 或 `npm i -g pnpm@11`） | DEPLOY.md:48 | 存在 | ✅ |
| PowerShell 7 | 7.x，**必须装 7**，可用 `DSH_PWSH_PATH` 指定 | DEPLOY.md:49 | `E:\GongJu\7\pwsh.exe`（**非标准位置**） | ✅ 有覆盖变量 |
| Python 3 | 3.12+，**勿用 Microsoft Store 版** | DEPLOY.md:50 | `python`/`py` 均解析到 `WindowsApps\` 桩，但真实 3.14.6 可用 | ⚠️ 见下 |
| VS Build Tools | 仅当引入原生依赖时需要 | DEPLOY.md:51 | — | ✅ |
| 网络 | GitHub 可达，需代理/VPN | DEPLOY.md:52 | — | ✅ |

**两个值得注意的点**：

- **Python 桩风险是真实的**：实测本机 `Get-Command python` → `C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\python.exe`（Store 桩），`py` 同样指向 `WindowsApps\`。但 `python -V` 与 `py -3 -V` 都返回 `Python 3.14.6`（Windows 的 App Execution Alias 会转发到真实解释器）。DEPLOY.md:50、196-197 对这个坑有明确警告，且 `health-check.ps1:34-72` 的四级定位链**显式排除 `WindowsApps`**（第 58、66 行）——处理得当。
- **`.bat` 入口依赖 PATH 里的裸 `pwsh.exe`**：`启动DSH.bat:8,11` 与 `更新DSH.bat:7` 都是 `pwsh.exe -NoProfile ...`。DEPLOY.md:49 声称"非默认安装位置可用 `DSH_PWSH_PATH` 指定"——但该变量**只在 `.ps1` 内部被 `Resolve-PwshPath` 读取**，`.bat` 入口用的是裸名，**`DSH_PWSH_PATH` 对双击 `.bat` 无效**。本机 `E:\GongJu\7` 若未加入 PATH，双击 `启动DSH.bat` 会直接失败（`'pwsh.exe' 不是内部或外部命令`）。属**文档未说明但可绕过**（改用 `pwsh -File start-dsh-web.ps1`）。

### 问题 2：哪些值是机器特定的？是否被正确隔离？

**答：隔离机制设计正确，实测有效。但 `health-check.cmd` 有一处硬编码未走定位链。**

**已正确隔离的（运行时派生，实测确认）**：

| 值 | 本机值 | 隔离方式 | 换机行为 |
|---|---|---|---|
| profile 目录 | `C:\Users\Administrator\.dsh` | `DSH_HOME` → `homedir()/.dsh` 运行时派生<br>`dsh-personal-hub/index.js:236-241` | ✅ 自动正确 |
| plugins 目录 | `E:\DSH\DSH-ops\plugins` | 从 `import.meta.url` 三级上溯派生<br>`dsh-personal-hub/index.js:244-245` | ✅ 自动正确 |
| 盘符 `E:\` | — | `sync-official.ps1:37-38`、`update-dsh.ps1:7-8` 全用 `Split-Path $PSScriptRoot -Parent` | ✅ 盘符自由 |
| 官方 checkout | `E:\DSH\Deepseek_DSH` | 同上，要求两仓库同父目录 | ✅ 结构约束（DEPLOY.md:54 已说明） |
| pwshPath | `E:\GongJu\7\pwsh.exe` | `personal.local.json:19`（gitignore） | ✅ 覆盖层 |
| pythonPath | `...\pythoncore-3.14-64\python.exe` | `personal.local.json:9`（gitignore） | ✅ 覆盖层 |
| computer-use link | 2 条 `link:E:/DSH/...` | `personal.local.json:26-27` | ✅ 覆盖层 |

**验证：`personal.local.json` 确实被 gitignore 且未入库**
`.gitignore:15` 明确排除；`git ls-files` 无该文件；`validateManifest` 实测 `{ok: true, errors: []}`。

**验证：清单与实际 profile 完全一致（实测）**

| 项 | DEPLOY.md 声明 | 实测 | 判定 |
|---|---|---|---|
| `plugins/` 目录数 | 12（DEPLOY.md:19） | 12 | ✅ |
| 挂载插件数 | 11（DEPLOY.md:150） | 11 | ✅ |
| profile `dependencies` | 13 条 link（DEPLOY.md:94） | 13（11 自研 + 2 官方 computer-use） | ✅ |
| profile `bundles` | 15 条（DEPLOY.md:95） | 15（2 基座 + 11 自研 + 2 Agent Teams） | ✅ |
| 补丁条数 | 17（DEPLOY.md:90） | **HEAD 版 17** ✅ / 工作区 24 | ✅（见问题 6） |
| restore 项 | 7（DEPLOY.md:90） | 7 | ✅ |
| 非幂等补丁 | 6（DEPLOY.md:168） | **HEAD 版 6** ✅ / 工作区 8 | ✅（见问题 6） |

**❌ 唯一的硬编码残留（本次审核新发现）**：

```
health-check.cmd:15: if not defined PWSH if exist "E:\GongJu\7\pwsh.exe" set "PWSH=E:\GongJu\7\pwsh.exe"
```

这是第 12-14 行"标准安装根 + 本机自定义根"兜底链的**最后一环**。换台机器后该路径不存在 → 该行静默跳过 → 若前三级也没命中，报 `PowerShell 7 not found` 并 `exit /b 2`。
**影响等级：需手工干预（低危）**——因为前三级（`where pwsh` → `%ProgramFiles%\PowerShell\7` → `%LocalAppData%\Microsoft\WindowsApps`）对标准安装的新机已经够用；只有在"pwsh 装在非标准路径且未入 PATH"的新机上才会失败。属注释里自称的"this machine's custom root"，**是有意的本机兜底而非疏漏**，但确实构成跨机不一致。

**对比：脚本主体已修掉的同类问题（说明这是已知纪律）**
`start-dsh-web.ps1:87` 注释「2026-09-19 部署审核：原为 `'C:\Program Files\nodejs\node.exe'` 硬编码 3 处」、`update-dsh.ps1:23` 同类注释。即 node 的硬编码已被清除，pwsh 的在 `.cmd` 里留了一处。

### 问题 3：`bootstrap-personal.ps1` 真能在新机跑通吗？

**答：逻辑基本健全、失败会 fail-loud，但有一个「静默错误」和一个「前置条件未检查」。**

**✅ 做得好的**：
- `$ErrorActionPreference = 'Stop'`（第 29 行）+ 每个外部命令后检查 `$LASTEXITCODE` 并 `throw`（第 43、57、68、77、82、160 行）→ **fail-loud 到位**
- 幂等：`Test-Path .git` 判断后跳过 clone（第 40、53 行）；`-SkipInstall` / `-SkipProfile` 开关
- 平级官方 checkout 自动克隆（第 48-62 行，注释明确「否则更新DSH.bat 第一次升级就失败」）
- 尊重 `DSH_HOME`（第 89 行）
- 只 `ConvertTo-Json` 一次（第 141-143 行注释记录了旧实现的 BUG：「落盘成 JSON 字符串字面量，覆盖层被整层静默忽略」）

**❌ 缺口 A（静默错误）：克隆失败时 `git` 本身不存在 → 报错信息误导**

第 40-43 行：
```powershell
if (-not (Test-Path (Join-Path $copy '.git'))) {
  git clone --depth 1 $OfficialUrl $copy
  if ($LASTEXITCODE -ne 0) { throw '官方仓库克隆失败（VPN/代理需先就绪）' }
```
若新机**没装 git**，`git` 不是可执行命令 → `$ErrorActionPreference='Stop'` 下抛出的是 PowerShell 的 `CommandNotFoundException`（英文），**不会走到第 43 行的中文提示**。用户看到的是英文 `The term 'git' is not recognized...`，而文档把 git 列为"任意现代版"（DEPLOY.md:46），容易被跳过。
**等级：需手工干预**（错误信息误导，非阻断）。

**❌ 缺口 B：完全不做前置条件检查**

实测扫描：`bootstrap-personal.ps1` 中**没有任何** node/pnpm/git 版本检查。仅有的 `Get-Command` 调用（第 94、99、113 行）是在**生成覆盖层时探测 pwsh/python 路径**，不是前置校验。

后果链：
- 无 node → 第 76 行 `node apply-patches.mjs` 抛 `CommandNotFoundException`
- 无 pnpm → 第 68 行 `pnpm install` 抛错，提示 `'pnpm install 失败'`（**未告知"pnpm 未安装"**）
- Node 版本不符（如 20.x）→ `pnpm install` 可能成功，失败推迟到第 82 行 `pnpm run build`，报 `'构建失败'`

对比：`start-dsh-web.ps1:101-105` 对 node **有**明确检查并给出可执行提示（「请安装 Node.js（^22.19 或 >=24）并确保其在 PATH, 或用环境变量 `DSH_NODE_PATH` 指向」）。bootstrap 作为**部署主入口**反而没有。
**等级：需手工干预**。

**❌ 缺口 C：`$userProfile = $env:USERPROFILE`（第 33 行）无兜底**
若 `USERPROFILE` 为空（极少数服务账户/受限环境），第 89 行 `Join-Path $userProfile '.dsh'` 会得到相对路径 `.dsh`，profile 装配到**当前工作目录**而非用户目录，且**不报错**。
**等级：文档未说明但可用**（正常交互式登录下 `USERPROFILE` 必然存在）。

### 问题 4：官方源码从哪来？

**答：三处 clone 兜底，覆盖完整；但都不 pin 版本。**

| 入口 | 位置 | 行为 |
|---|---|---|
| bootstrap 主克隆 | `bootstrap-personal.ps1:42` | `git clone --depth 1 $OfficialUrl $copy` → 副本 |
| bootstrap 平级克隆 | `bootstrap-personal.ps1:56` | `git clone --depth 1 $OfficialUrl $officialRoot` → 升级源 |
| sync 兜底 | `sync-official.ps1:44-53` | 平级缺失时自动克隆（注释：「2026-09-19 审核」新增） |
| update 兜底 | `update-dsh.ps1:48-57` | 同上，注释标注「避免『升级链在新机 100% 失败』（2026-09-19 部署审核 BLOCKER）」 |
| check-update 提示 | `check-update.ps1:12-18` | 缺失时**只提示不克隆**，且 `exit 0`（不阻塞启动） |

**新机首次拿到官方仓库的路径是通的**：bootstrap 第 1、1b 步 + 两处自动克隆兜底，共 4 个入口。

**❌ 但：全部无版本 pin（本次审核的核心结论之一）**

实测四处命令均无 `--branch` / `--tag` / commit 指定：
```
bootstrap-personal.ps1:42: git clone --depth 1 $OfficialUrl $copy
bootstrap-personal.ps1:56: git clone --depth 1 $OfficialUrl $officialRoot
sync-official.ps1:48:      git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git $official
update-dsh.ps1:50:         git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git $repo
```
`--depth 1` 还会**丢弃 tag**（新机上 `git describe` 无锚点可回溯）。

实测当前官方 checkout：`ddefc45f` `(HEAD -> master, tag: dsh-v0.1.6-alpha.2, origin/master)`，而仓库**有更高版本 tag**（`git tag --sort=-creatordate` 显示 `dsh-v0.1.6-alpha.2` 是最新，但历史 tag 从 `dsh-v0.1.2-alpha.5` 起）。

→ **"一模一样"缺少可复现锚点**：部署结果取决于**执行时刻**的 `master` HEAD。
→ 与 DEPLOY.md:153 的验收项「版本与开发机一致（当前 `0.1.6-alpha.2`）」存在张力：该验收**今天能过、明天可能不过**。

**等级：建议改进**（若用户接受"跟随官方最新"的语义，则仅需文档说明；若要求严格一致，则需 pin tag）。

### 问题 5：凭据与配置需要手工准备什么？

**答：文档说清了"需要哪些"，但仓库模板不足以还原同一套配置。**

**实测 `~/.dsh/.credentials.yaml` 需要的项（只列键名，不含任何值）**：
```
version
refs:
  DEEPSEEK_API_KEY
  UNLIMITDS_API_KEY
  BAI_API_KEY
  AGNES_API_KEY
  OPENCODE_API_KEY
  OPENCODE_GO_API_KEY
records:
  client-connection/browser-session   （含 secret —— 浏览器会话记录）
```
共 **6 个 API Key** + 1 条浏览器会话记录。

**实测 `~/.dsh` 下需要手工准备的用户数据**（存在性核查）：

| 项 | 状态 | DEPLOY.md 是否说明 |
|---|---|---|
| `settings.yaml` | 存在（264 行 / 10 顶层键） | ✅ 第 128 行，且诚实说明模板不含 provider 等 |
| `.credentials.yaml` | 存在（6 key） | ✅ 第 129 行 |
| `AGENTS.md` | 存在 | ✅ 第 130 行（给了模板 + 改写指引） |
| `github-push/credentials.json` | 存在 | ✅ 第 131 行 |
| `server-ssh/` | 存在（1 项） | ✅ 第 131 行 |
| `backups/` | 存在（75 项） | ✅ 第 132 行（可选） |
| `profiles/web/cordis.patch.yml` | 存在 | ⚠️ 第 198-202 行部分说明（见下） |

**⚠️ 三处需要澄清**：

1. **`config/settings.yaml` 缺 3 节（实测）**
   模板 7 键：`ui-onboarding, agent-default-model, agent-presets, permission, ui-theme, llm-pi-ai, ui-conversation`
   实际 10 键：上述 + **`shell`、`subagent-model-selection`、`llm-deepseek`**
   其中 **`subagent-model-selection` 正是本次未提交补丁（队友模型选择）依赖的授权清单**——缺它则 `spawn_teammate` 的 `provider`/`model` 参数会抛「teammate model selection is disabled by the deployment settings」。DEPLOY.md:128 已警告"照它配出来的不是同一套"，但未点出具体缺哪几节。

2. **`AGENTS.md` 模板无机器特定内容（实测）**
   `config/AGENTS-global-template.md` 中**不含**任何 `E:\` / `C:\` / `Administrator` / `GongJu` 字样 → 可直接复制使用，无需改写。但 DEPLOY.md:130 说「按本机路径改写」，属**过度提示**（无实际需要）。

3. **`cordis.patch.yml` 的机器特定值会经 reapply 自动重建（实测确认）**
   实测 profile 内该文件 37 行，含两处机器特定值：
   - 第 13 行 `pythonPath: 'C:\Users\Administrator\...'`
   - 第 35 行 `pwshPath: 'E:\GongJu\7\pwsh.exe'`
   二者都来自 `personal.local.json` 的托管条目，`reapply` 会重写 → **新机自动正确**。
   第 36-37 行 `- id: tool-agent-team / disabled: false` 是**非托管条目**（官方 Agent Teams 自行写入），DEPLOY.md:198-202 已说明 reapply「逐字保留但不生成」，并给了手工补齐指引 ✅

### 问题 6：结论与缺口清单

见下方第三节。

---

## 三、缺口清单（按严重度）

### 🔴 阻断部署

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| **B1** | **交付状态不干净：7 条补丁未提交 + 3 个提交未推送** | `git status --porcelain` 非空（`M official-patches/apply-patches.mjs`，+169 行 = 7 条补丁）；`git log origin/main..HEAD --oneline` 3 行；`?? buglog/*.md` × 3 | 新机 clone 得到的是**旧补丁集（17 条）**，「队友可选模型」功能完全缺失。DEPLOY.md:215-216 的交付前检查**两项均不通过** |
| **B2** | **无版本固定：4 处 clone 都不 pin 版本** | `bootstrap-personal.ps1:42,56`、`sync-official.ps1:48`、`update-dsh.ps1:50` 均为裸 `--depth 1` | 「一模一样」无时间锚点；不同日期部署得到不同官方版本。且 `--depth 1` 丢 tag，事后无法回溯 |

> **补充说明（重要）**：B1 的 7 条未提交补丁**恰好修复了一个会导致构建失败的问题**。工作区版本第 18 条补丁的注释明确写道：若在 `agent-team/src/types.ts` 引入 Host 面 `AgentOptions`，会把 `Context.sessions: SessionStore` 合并带进 client 编译单元，导致 `client-ui-agent-team/src/client/mount.ts` 报三处 TS2339 并**阻断全量 `pnpm run build`**。
> **内存模拟验证（实测）**：HEAD 版 17 条补丁 @ 纯净官方 = **17/17 成功**；工作区版 24 条 = **24/24 成功**。两者都能应用。
> **推论（推断，未实机验证）**：由于 HEAD 版补丁**不含** agent-team 改动，新机按 HEAD 部署**不会**遇到该 TS2339（该错误源自运行副本里已存在的 agent-team 改动，而非补丁）。故 B1 的后果是「**功能缺失**」而非「构建失败」。此推论未经新机实机验证。

### 🟠 需要手工干预

| # | 缺口 | 证据 | 影响与绕过 |
|---|---|---|---|
| **M1** | **`config/settings.yaml` 是骨架，非可用配置** | 实测模板 7 顶层键 vs 实际 10 键；缺 `shell`、`subagent-model-selection`、`llm-deepseek` | 照模板部署 → 缺 subagent 模型授权、缺 DeepSeek 直连 provider。DEPLOY.md:128 已警告但未列具体缺项。**绕过**：从旧机复制 `settings.yaml` |
| **M2** | **`bootstrap-personal.ps1` 不做前置条件检查** | 实测全文无 node/pnpm/git 版本校验；仅第 94/99/113 行探测 pwsh/python 路径 | 无 pnpm 时报 `'pnpm install 失败'`（不提"未安装"）；Node 版本不符时失败推迟到 build 阶段。**绕过**：先手工跑 DEPLOY.md 第 0 步的 `node -v` / `pnpm -v` |
| **M3** | **`health-check.cmd:15` 硬编码 `E:\GongJu\7\pwsh.exe`** | `health-check.cmd:15` | 新机该路径不存在 → 静默跳过。仅当"pwsh 装非标准位且未入 PATH"时导致体检入口 `exit /b 2`。**绕过**：`pwsh -NoProfile -File health-check.ps1` |
| **M4** | **`.bat` 入口用裸 `pwsh.exe`，`DSH_PWSH_PATH` 对其无效** | `启动DSH.bat:8,11`、`更新DSH.bat:7` | 与 DEPLOY.md:49「非默认安装位置可用 `DSH_PWSH_PATH` 指定」的表述冲突（该变量只被 `.ps1` 内 `Resolve-PwshPath` 读取）。pwsh 未入 PATH 时双击 `.bat` 失败。**绕过**：`pwsh -File start-dsh-web.ps1` |
| **M5** | **bootstrap 克隆失败时错误信息误导（git 未装）** | `bootstrap-personal.ps1:40-43` | 无 git 时抛 PowerShell 英文 `CommandNotFoundException`，走不到第 43 行的中文「VPN/代理需先就绪」提示 |

### 🟡 文档未说明但实际可用

| # | 项 | 证据 | 说明 |
|---|---|---|---|
| **D1** | **DEPLOY.md:58 称 `update-dsh.ps1` 不读 `DSH_HOME`——已过时** | `update-dsh.ps1:10-12` 实际**尊重** `DSH_HOME`（注释：「尊重 DSH_HOME（隔离演练 / 多机部署不污染主环境的 ~/.dsh）」） | 该警告是安全侧的保守表述（演练时别跑升级链），**不影响正确性**，但会误导读者以为代码没做隔离 |
| **D2** | **DEPLOY.md:190-192 的 DSH_HOME 支持列表不准确** | 实测：`start-dsh-web.ps1` **不读** `DSH_HOME`；`sync-official.ps1` 不需要（不碰 profile）；`reapply-cli.mjs` 通过 personal-hub 间接尊重 | 文档列了 `start-dsh-web` 但实际不支持；`health-check.py:38` 实际支持（文档第 191 行正确列为"固定 ~/.dsh"，**这条也过时**） |
| **D3** | **`config/AGENTS-global-template.md` 无需"按本机路径改写"** | 实测全文无机器特定字样 | DEPLOY.md:130 的"按本机路径改写"属过度提示 |
| **D4** | **`$env:USERPROFILE` 无兜底** | `bootstrap-personal.ps1:33,89` | 正常交互式登录必存在；服务账户下会把 profile 装到相对路径且不报错 |
| **D5** | **补丁计数与幂等数在 HEAD/工作区不一致** | HEAD：17 条 / 6 非幂等（与 DEPLOY.md:90,168 **完全一致** ✅）；工作区：24 条 / 8 非幂等 | 文档对**已提交版本**是准确的；一旦推送 7 条新补丁，这两处数字需同步更新 |

### 🔵 建议改进

| # | 建议 | 理由 |
|---|---|---|
| **S1** | 在 DEPLOY.md 第 2 步后加一节「**验证部署确实一致**」，用 `git rev-parse HEAD` 记录官方 commit，与新机对比 | 补上 B2 缺失的可复现锚点（即使不 pin，也能事后核对） |
| **S2** | 给 4 处 clone 增加可选 `-OfficialRef <tag/sha>` 参数（默认仍取 HEAD，保持现状语义） | 需要严格一致时可 pin；不改变默认行为 |
| **S3** | 把 `config/settings.yaml` 补成**功能完整**的骨架（至少加 `subagent-model-selection` 与 `llm-deepseek` 的空节） | 消除 M1；或在 DEPLOY.md 明列缺哪三节 |
| **S4** | `bootstrap-personal.ps1` 开头加与 `start-dsh-web.ps1:101-105` 同款的 node/pnpm/git 前置检查 | 消除 M2、M5；把失败提前到第 0 步并给中文指引 |
| **S5** | `health-check.cmd:15` 的本机兜底改为读 `DSH_PWSH_PATH`，或明确注释"本机专用，新机可删" | 消除 M3；与 PLUGIN-STANDARD.md:161「禁止写死」的纪律一致 |
| **S6** | `启动DSH.bat` / `更新DSH.bat` 改为先 `where pwsh` 再回落，或直接调用 `powershell.exe`（5.1）来拉起 `.ps1` | 消除 M4 |
| **S7** | 修正 DEPLOY.md:58、190-192 的 DSH_HOME 表述，与代码实际对齐 | 消除 D1、D2 |
| **S8** | 交付前检查（DEPLOY.md:215-216）增加一条：`git log origin/main..HEAD` 与 `git status` 的**退出码**判断，便于脚本化 | 当前只有人工"期望为空"的说明 |

---

## 四、文档改进建议

### 建议 1：DEPLOY.md 开头增加「一致性等级」声明

当前文档承诺"从零部署**与开发机一致**的一套个人 DSH"（DEPLOY.md:3），但实际存在两个不可控维度。建议明确：

```markdown
> **一致性边界**：本流程保证「**个人层**一致」（补丁集、插件、profile 清单），
> 但**不保证官方源码版本一致**——四处 clone 均取 master HEAD（无 tag pin）。
> 若需严格复现，部署前记录开发机 `git -C <官方checkout> rev-parse HEAD`，
> 在新机 `git -C <官方checkout> checkout <该sha>` 后再跑 bootstrap。
```

### 建议 2：把「交付前检查」升级为可执行脚本

DEPLOY.md:213-217 目前是两条人工命令。建议提供 `check-delivery.ps1`，非零退出即拒绝交付：

```powershell
# 期望两项均为空；非空则 exit 1
git -C $ops status --porcelain
git -C $ops log origin/main..HEAD --oneline
```
理由：本次审核正是**靠人工跑这两条才发现 B1**；自动化后不会再漏。

### 建议 3：第 3 步用户数据表增加「缺项后果」列

现有表格（DEPLOY.md:126-132）只说明"怎么来"，未说明"缺了会怎样"。建议补充：

| 文件 | 缺失后果 |
|---|---|
| `settings.yaml`（用仓库模板） | 无 `subagent-model-selection` → 队友模型选择报错；无 `llm-deepseek` → 无 DeepSeek 直连 provider |
| `.credentials.yaml` | 服务能起、插件能加载，但模型调用全部报未配置 |
| `AGENTS.md` | 会话不注入全局协作规则（D7 工具分工等失效） |
| `github-push/credentials.json` | push 功能不可用 |
| `server-ssh/` | SSH 工具集不可用 |

### 建议 4：第 4 步验证清单增加「一致性核对」项

现有 6 项（DEPLOY.md:147-154）都是"服务能跑"，**没有一项验证"是否同一套"**。建议加：

| # | 检查 | 命令/期望 |
|---|---|---|
| 7 | 官方版本锚点 | `git -C <官方checkout> rev-parse HEAD` → 与开发机记录的 sha 一致 |
| 8 | 补丁条数 | `node official-patches/apply-patches.mjs --dry-run`（若支持）或人工核对条数与 DEPLOY.md:90 声明一致 |
| 9 | settings 完整度 | 对比 `~/.dsh/settings.yaml` 顶层键数（开发机 10 个） |

---

## 五、未验证事项（明确区分「已核实」与「推断」）

### ✅ 已核实（本次实机执行，输出可复现）

1. 所有路径与计数声明：`plugins/` 12 目录、11 挂载插件、13 link 依赖、15 bundles —— **全部与 DEPLOY.md 一致**
2. HEAD 版补丁 **17 条 / 6 非幂等**，与 DEPLOY.md:90,168 **完全一致**
3. 工作区版补丁 **24 条 / 8 非幂等**（未提交，+7 条）
4. 内存模拟：HEAD 17 条 @ 纯净官方 = **17/17 可应用**；工作区 24 条 = **24/24 可应用**
5. `git status --porcelain` 非空、`git log origin/main..HEAD` = 3 提交 —— **DEPLOY.md 交付前检查两项均不通过**
6. 四处 clone 命令**均无版本 pin**（逐行核对）
7. 纯净官方 checkout 处于 `ddefc45f` / `tag: dsh-v0.1.6-alpha.2` / `master`
8. `config/settings.yaml` 7 顶层键 vs 实际 10 键（缺 `shell`、`subagent-model-selection`、`llm-deepseek`）
9. `personal.local.json` 被 gitignore、未入库；`validateManifest` → `{ok: true, errors: []}`
10. `validate-plugins.mjs` → **11/11 PASS，exit 0**
11. `check-plugin-copy.mjs` → **missing 0，exit 0**
12. `node --check` 全部部署链脚本（7 个 .mjs/.js）→ **全部 PASS**
13. 本机 `python`/`py` 均解析到 `WindowsApps\` 桩，但 `python -V` = `Python 3.14.6`
14. `health-check.ps1:58,66` 显式排除 `WindowsApps`；`health-check.cmd:15` 硬编码 `E:\GongJu\7\pwsh.exe`
15. `.bat` 入口 3 处使用裸 `pwsh.exe`；`update-dsh.ps1:10-12` 实际尊重 `DSH_HOME`
16. `~/.dsh/.credentials.yaml` 结构：6 个 API Key 键名 + 1 条 browser-session 记录（**仅键名，未读取任何值**）
17. 运行副本 `DSH-ops\Deepseek_DSH` **无独立 `.git`**（`git -C` 会向上解析到 DSH-ops 仓库）
18. `prune-copy.mjs:64` 的 `SKIP_DIRS` 含 `.git` → prune 不会删 `.git`；副本无 `.git` 是 `robocopy /XD .git`（`sync-official.ps1:55`）所致
19. `config/AGENTS-global-template.md` 不含任何机器特定字样

### ⚠️ 推断（未实机验证，标注推理依据）

1. **【推断】新机按 HEAD 部署不会遇到 `client-ui-agent-team` 的 TS2339 构建失败**
   依据：HEAD 版 17 条补丁不含 agent-team 改动；该错误源自运行副本中已存在的 agent-team 类型改动。**未在新机/纯净环境跑 `pnpm run build` 验证**（任务约束禁止全量构建）。
2. **【推断】`DSH_PWSH_PATH` 对 `.bat` 入口无效**
   依据：`.bat` 用裸 `pwsh.exe`，`DSH_PWSH_PATH` 仅在 `.ps1` 的 `Resolve-PwshPath` 内被读取。**未在"pwsh 不在 PATH"的环境实测**。
3. **【推断】新机缺 `subagent-model-selection` 会导致队友模型选择报错**
   依据：未提交补丁第 23 条的函数体逻辑（`raw?.enabled !== true` → throw）。**未实机触发**。
4. **【推断】`--depth 1` 克隆后 tag 不可用**
   依据：git 浅克隆默认不取 tag 对象。当前纯净官方有完整 tag 是因为它非浅克隆。**未在浅克隆环境验证**。
5. **【推断】`robocopy /XD .git` 是副本无 `.git` 的原因**
   依据：`sync-official.ps1:55` 的 `$excludeDirs` 含 `.git`；`bootstrap-personal.ps1:42` 的 `git clone` 本应创建 `.git`。**未逐次追查副本构建历史**（副本无 git 历史，无法回溯）。

### 🚫 本次未做（超出审核范围或受约束限制）

1. **未在真实新机/隔离环境跑完整 bootstrap** —— 无第二台机器；隔离演练需设 `DSH_HOME` 并跑 `pnpm install` + `pnpm run build`（数分钟且会写盘），任务约束"不得安装依赖"
2. **未跑 `pnpm run build` 全量** —— 任务明确禁止
3. **未跑 `health-check.cmd` / `health-check.py`** —— 会触碰运行中服务的状态（复活看门狗等），任务约束"不得重启服务"
4. **未验证 `update-dsh.ps1` 的升级链实际行为** —— 会触发 `git pull` + 构建 + 重启，破坏性操作
5. **未读取任何密钥值** —— 仅统计 `.credentials.yaml` 的键名结构
6. **未验证 `pnpm install` 在新机的原生依赖（fs-ext / VS Build Tools）表现** —— 需实机
7. **未验证网络/代理路径**（`lib-proxy.ps1` 的代理诊断逻辑仅阅读，未执行）

---

## 附录：本次审核执行的只读命令清单

```powershell
# 交付状态
git -C E:\DSH\DSH-ops status --porcelain
git -C E:\DSH\DSH-ops log origin/main..HEAD --oneline
git -C E:\DSH\DSH-ops remote -v
git -C E:\DSH\DSH-ops diff --stat -- official-patches/apply-patches.mjs
git -C E:\DSH\DSH-ops show HEAD:official-patches/apply-patches.mjs
git -C E:\DSH\Deepseek_DSH log -1 --format='%H %ci %d'
git -C E:\DSH\Deepseek_DSH describe --tags --always
git -C E:\DSH\Deepseek_DSH tag --sort=-creatordate

# 只读闸门（DEPLOY.md 验证清单第 2、3 条）
node E:\DSH\DSH-ops\validate-plugins.mjs          # → 11/11 PASS, exit 0
node E:\DSH\DSH-ops\check-plugin-copy.mjs         # → missing 0, exit 0

# 语法检查
node --check <每个部署链 .mjs/.js>                 # → 7/7 PASS

# 只读清单校验
node -e "import('.../dsh-personal-hub/index.js').then(m => m.validateManifest('.../personal.json'))"
                                                  # → {ok: true, errors: []}

# 内存模拟补丁应用（不写盘）
node -e "<解析 patches 数组，对纯净官方文件做 old-count 校验>"
                                                  # → HEAD 17/17, 工作区 24/24

# 工具链定位
Get-Command node, pwsh, git, py, python
python -V ; py -3 -V
```

**全程未修改任何文件**（除本报告），未重启服务，未安装依赖。
**注**：审核过程中曾在 `E:\DSH\DSH-ops\` 误建一个临时探测脚本 `_tmp_idem_probe.mjs`，**已立即删除**并用 `node -e` 内联方式重做；`git status --porcelain` 已确认工作区恢复原状（仅剩审核前既有的改动）。
