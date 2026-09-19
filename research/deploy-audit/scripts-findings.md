# B-脚本层审核：部署链硬编码与移植性全量扫描

- 任务：task-2「B-脚本层审核：部署链硬编码与移植性全量扫描」
- 审核员：audit-scripts
- 范围：`E:\DSH\DSH-ops`（排除 `node_modules` / `Deepseek_DSH` / `.git` / `__pycache__` / `research`）
- 方法：只读扫描（python 工具按 D7 做统计），运行期事实用 `shutil.which` / 环境变量 / 只读源码交叉验证；本次**未修改任何被审文件**
- 判定基准：**新机 = 按 DEPLOY.md 第 1 步只 `git clone` dsh-ops、盘符与用户名与开发机不同、工具安装位置可能不同**

---

## 0. 结论摘要（先看这里）

| # | 严重度 | 一句话 | 位置 |
|---|---|---|---|
| 1 | **BLOCKER** | 升级链硬依赖「与 DSH-ops **平级**的官方 checkout」，而新机按 DEPLOY.md 永远不会创建它 → `更新DSH.bat` 必然失败 | `update-dsh.ps1:8,18-21` `sync-official.ps1:37,44` `check-update.ps1:6` |
| 2 | **BLOCKER** | `node.exe` 绝对路径硬编码 4 处，其中 1 处是**启动服务本体**；新机 node 装在任何非 `C:\Program Files\nodejs` 位置 → 启动链直接失败 | `start-dsh-web.ps1:127,183,242` `update-dsh.ps1:284` |
| 3 | INCONSISTENT | `启动DSH.bat` / `更新DSH.bat` 只用裸 `pwsh.exe`（无定位链），而 `health-check.cmd` 有 4 级定位链 | `启动DSH.bat:8,11` `更新DSH.bat:7` |
| 4 | INCONSISTENT | `update-dsh.ps1` 硬编码 `$env:USERPROFILE\.dsh`（5 处），**不尊重 `DSH_HOME`** → 与 bootstrap/reapply/看门狗的行为相反 | `update-dsh.ps1:105,110,117,120,123` `health-check.py:35` |
| 5 | INCONSISTENT | bootstrap 生成的 `personal.local.json` **不含 `extraDependencies`** → 新机 profile 缺 2 个 computer-use 官方包（`failed to import`，不阻断启动） | `bootstrap-personal.ps1:80-87` |
| 6 | INCONSISTENT | 同一模板**不含 `pythonPath`**，且 `dsh-tool-python` 的发现路径不含 `%LOCALAPPDATA%\Python`（本机 python 实际就在那） | `plugins/dsh-tool-python/index.js:51-57` vs `health-check.ps1:63` |
| 7 | INCONSISTENT | 全链硬编码端口 `3080`，与 DEPLOY.md「可改 settings.yaml 端口」的建议冲突 | `start-dsh-web.ps1`(12 处) `watchdog-dsh.ps1:133` `health-check.py:34` |
| 8 | INCONSISTENT | 4 个核心 `.ps1` **缺 UTF-8 BOM**（违反本仓自定规则），一旦经 Windows PowerShell 5.1 执行即中文乱码/解析错误 | `bootstrap-personal.ps1` `start-dsh-web.ps1` `update-dsh.ps1` `watchdog-dsh.ps1` |
| 9 | INCONSISTENT | 余额胶囊 `dsh-deepseek-balance` 的 `REPO_DIR` 平级假设 → 新机「DSH 版本」胶囊失效、升级按钮必失败 | `plugins/dsh-deepseek-balance/index.js:33,363-365` |
| 10 | INCONSISTENT | `health-check.py` 用裸 `pwsh`/`node` 且 `run()` 无异常捕获 → 新机缺其一则体检自身崩溃 | `health-check.py:54-55,104,164,177,228` |

### 「新机升级链是否可用」——明确结论

> **不可用（BLOCKER）。**
> 新机按 DEPLOY.md 部署后只存在 `<个人仓库根>\DSH-ops\Deepseek_DSH`（副本）；
> `update-dsh.ps1` 却把官方 checkout 定位到 `<个人仓库根>\Deepseek_DSH`（**平级**，`Split-Path $ops -Parent`）。
> 该目录在新机不存在 → `update-dsh.ps1:18-21` 直接 `exit 1`，打印「错误: 未找到仓库 …」。
> 用户入口 `更新DSH.bat:7` 调用的正是它 → 双击升级 100% 失败。
> 连带的 `sync-official.ps1:44` 抛异常、`check-update.ps1:17-22` 把「目录不存在」误报成 VPN 网络故障。
> **修复前，新机无法执行任何官方升级。**

---

## 1. 逐文件扫描记录（77 个文件，含无命中）

图例：命中模式 = `DRIVE`(盘符绝对路径) / `ADMIN`(用户名) / `NODE_HARD`(`Program Files\nodejs`) / `PWSH_HARD`(`GongJu` 或 `PowerShell\7`) / `DEEPSEEK_DSH` / `POWERSHELL_EXE` / `DSH_HOME`。

### 1.1 PowerShell 脚本（9 个）

| 文件 | 结果 | 说明 |
|---|---|---|
| `bootstrap-personal.ps1` | 已扫描（命中 8 处：DRIVE=1, PWSH_HARD=1, DEEPSEEK_DSH=3, DSH_HOME=3） | L79 pwsh 回退硬编码；L32 `Deepseek_DSH` 副本路径（正确）；L73 尊重 DSH_HOME（正确） |
| `start-dsh-web.ps1` | 已扫描（命中 13 处：DRIVE=3, NODE_HARD=3, PWSH_HARD=1, DEEPSEEK_DSH=4, POWERSHELL_EXE=2） | **L127/L183/L242 node 硬编码**；L12 `$official` 死变量；L91/L112 `powershell.exe` 为进程名匹配（非违规） |
| `update-dsh.ps1` | 已扫描（命中 5 处：DRIVE=1, NODE_HARD=1, DEEPSEEK_DSH=3） | **L8 平级官方目录**；**L284 node 硬编码**；L105-123 硬编码 `USERPROFILE\.dsh` |
| `sync-official.ps1` | 已扫描（命中 6 处：DRIVE=2, DEEPSEEK_DSH=4） | L5-L6 注释写死 `E:\DSH\...`；L37 平级 `$official`；L44 缺则 throw |
| `check-update.ps1` | 已扫描（命中 2 处：DEEPSEEK_DSH=2） | L6 平级 `$repo`；L17-22 缺目录时误报网络问题 |
| `watchdog-dsh.ps1` | 已扫描（命中 3 处：PWSH_HARD=1, POWERSHELL_EXE=1, DSH_HOME=1） | L173-174 **有** node 定位链（对照组）；L150-151 尊重 DSH_HOME（正确）；L60 进程名匹配 |
| `health-check.ps1` | 已扫描（**无命中**） | `#Requires -Version 7`；4 级 python 定位链；无绝对路径 |
| `lib-proxy.ps1` | 已扫描（**无命中**） | 仅注册表 + HTTPS 探测，**不引用 Deepseek_DSH**（见 §2.1 反证） |
| `.g5-observer.ps1` | 已扫描（命中 2 处：DRIVE=2） | L1、L6 硬编码 `E:\DSH\DSH-ops\...` |

### 1.2 Python 脚本（1 个）

| 文件 | 结果 | 说明 |
|---|---|---|
| `health-check.py` | 已扫描（命中 1 处：POWERSHELL_EXE=1） | L35 `Path.home()/".dsh"` 硬编码、**不尊重 DSH_HOME**；L34 端口硬编码；L96 进程名匹配（非违规）；L104/164/177/228 裸 `pwsh`/`node` |

### 1.3 mjs / cjs 脚本（23 个）

| 文件 | 结果 | 说明 |
|---|---|---|
| `reapply-cli.mjs` | 已扫描（**无命中**） | 全运行时派生，路径由 `import.meta.url` + 清单推导 |
| `validate-plugins.mjs` | 已扫描（命中 3 处：DEEPSEEK_DSH=2, DSH_HOME=1） | L44 指向**副本内** `Deepseek_DSH/packages/core/tools/lib`（正确）；L47 尊重 DSH_HOME（正确）；L209-212 缺件 fail-loud 并提示 `pnpm run build` |
| `disable-plugin.mjs` | 已扫描（命中 2 处：DRIVE=1, DSH_HOME=1） | L13 仅注释里的示例路径；L28 尊重 DSH_HOME（正确） |
| `new-plugin.mjs` | 已扫描（命中 1 处：DEEPSEEK_DSH=1） | **L37 平级 `Deepseek_DSH`** —— 只用于生成 README 命令文本，不参与运行 |
| `check-plugin-copy.mjs` | 已扫描（命中 1 处：DSH_HOME=1） | L37 尊重 DSH_HOME（正确） |
| `test-standard.mjs` | 已扫描（**无命中**） | L25 `process.execPath` 取 node、L45 `mkdtemp(tmpdir())` 用临时 profile —— 可移植性最好的样本 |
| `official-patches\apply-patches.mjs` | 已扫描（**无命中**） | L15 目标路径来自 argv；L232 运行时派生 repoRoot |
| `official-patches\prune-copy.mjs` | 已扫描（**无命中**） | 目标路径来自 argv |
| `add-all-endpoint-models.cjs` | 已扫描（命中 4 处：DRIVE=2, ADMIN=1, DEEPSEEK_DSH=1） | 一次性维护脚本，见 §5 NIT-5 |
| `add-opencode-live-entry.cjs` | 已扫描（命中 4 处：DRIVE=2, ADMIN=1, DEEPSEEK_DSH=1） | 同上 |
| `finalize-opencode-routes.cjs` | 已扫描（命中 7 处：DRIVE=4, ADMIN=1, DEEPSEEK_DSH=2） | 同上 |
| `fix-anthropic-group.cjs` | 已扫描（命中 4 处） | 同上 |
| `fix-opencode-go-settings.cjs` | 已扫描（命中 4 处） | 同上 |
| `patch-opencode-go-models.cjs` | 已扫描（命中 4 处） | 同上 |
| `patch-opencode-session-config.cjs` | 已扫描（命中 4 处） | 同上 |
| `probe-anthropic-group.mjs` | 已扫描（命中 2 处） | 同上 |
| `probe-deepseek-flash-identity.mjs` | 已扫描（命中 2 处） | 同上 |
| `probe-deepseek-generations.mjs` | 已扫描（命中 2 处） | 同上 |
| `probe-discovery-paths.mjs` | 已扫描（命中 2 处） | 同上 |
| `probe-opencode-full.mjs` | 已扫描（命中 6 处：DRIVE=4, ADMIN=1, DEEPSEEK_DSH=1） | 同上 |
| `verify-llm-section.mjs` | 已扫描（命中 6 处：DRIVE=3, ADMIN=1, DEEPSEEK_DSH=2） | 同上（L4 `file:///E:/…` 绝对 URL import，新机必失败） |
| `verify-session-header-injection.mjs` | 已扫描（命中 5 处） | 同上 |
| `verify-session-header-live.mjs` | 已扫描（命中 7 处：DRIVE=4, ADMIN=2, DEEPSEEK_DSH=1） | 同上 |
| `plugins\dsh-github-push\build.mjs` | 已扫描（**无命中**） | 构建脚本，无绝对路径 |
| `plugins\dsh-server-ssh\build.mjs` | 已扫描（**无命中**） | 同上 |

### 1.4 cmd / bat（3 个）

| 文件 | 结果 | 说明 |
|---|---|---|
| `health-check.cmd` | 已扫描（命中 3 处：DRIVE=1, PWSH_HARD=2） | L11 `where pwsh` → L13/L14 标准位 → **L15 `E:\GongJu\7\pwsh.exe` 机器特定回退** → L16-19 友好报错。纯 ASCII，无代码页依赖 |
| `启动DSH.bat` | 已扫描（**无命中**） | **L8/L11 裸 `pwsh.exe`**（依赖 PATH，无回退、无报错提示）；L22 `ping -n 4 127.0.0.1` 作延时 |
| `更新DSH.bat` | 已扫描（**无命中**） | **L7 裸 `pwsh.exe`**；L15 `ping` 延时 |

### 1.5 plugins/（33 个 index.js / client.js / package.json）

| 文件 | 结果 |
|---|---|
| `plugins\dsh-bug-log\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-bug-log\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-computer-use\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-computer-use\package.json` | 已扫描（**无命中**） |
| （附）`plugins\dsh-computer-use\cordis.patch.yml` | 已扫描（不在必扫范围，为判定 §3.3 单独只读检查）：`:14-18` 用**裸包名** insert 两个官方包 |
| `plugins\dsh-deepseek-balance\index.js` | 已扫描（命中 6 处：DRIVE=3, PWSH_HARD=1, DEEPSEEK_DSH=2）—— **L33 平级 REPO_DIR**、L196 注释、L210-211 可回退常量 |
| `plugins\dsh-deepseek-balance\client.js` | 已扫描（**无命中**） |
| `plugins\dsh-deepseek-balance\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-github-push\index.js` | 已扫描（命中 1 处：DSH_HOME=1）—— L13 尊重 DSH_HOME（正确） |
| `plugins\dsh-github-push\client.js` | 已扫描（命中 1 处：DRIVE=1）—— L615 UI placeholder `E:/DSH/DSH-ops` |
| `plugins\dsh-github-push\src\client.js` | 已扫描（命中 1 处：DRIVE=1）—— L574 同上（源文件） |
| `plugins\dsh-github-push\src\index.js` | 已扫描（命中 1 处：DSH_HOME=1，注释） |
| `plugins\dsh-github-push\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-locale-language\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-locale-language\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-opencode-session-id\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-opencode-session-id\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-personal-bar\client.js` | 已扫描（**无命中**） |
| `plugins\dsh-personal-bar\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-personal-bar\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-personal-hub\index.js` | 已扫描（命中 3 处：DSH_HOME=3）—— L236-248 profileDir/pluginsDir **运行时派生（正确）** |
| `plugins\dsh-personal-hub\client.js` | 已扫描（**无命中**） |
| `plugins\dsh-personal-hub\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-plugin-guide\client.js` | 已扫描（**无命中**） |
| `plugins\dsh-plugin-guide\index.js` | 已扫描（**无命中**） |
| `plugins\dsh-plugin-guide\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-restart-resume\index.js` | 已扫描（命中 5 处：DRIVE=2, DEEPSEEK_DSH=1, DSH_HOME=2）—— L66-67 尊重 DSH_HOME（正确）；L91-92 可回退常量 |
| `plugins\dsh-restart-resume\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-server-ssh\index.js` | 已扫描（命中 1 处：DSH_HOME=1）—— L20181 尊重 DSH_HOME（正确）。**说明：初次正则命中的 `3080` 是打包代码里的数字巧合（L1982 `3259730800`、L3125 `3080475397`），非端口硬编码，已排除误报** |
| `plugins\dsh-server-ssh\client.js` | 已扫描（命中 1 处：DRIVE=1）—— L554 placeholder `C:/Users/…/.ssh/id_ed25519`（用省略号，通用，无害） |
| `plugins\dsh-server-ssh\src\client.js` | 已扫描（命中 1 处：DRIVE=1）—— L533 同上（源文件） |
| `plugins\dsh-server-ssh\src\index.js` | 已扫描（命中 1 处：DSH_HOME=1，注释） |
| `plugins\dsh-server-ssh\package.json` | 已扫描（**无命中**） |
| `plugins\dsh-tool-python\index.js` | 已扫描（**无命中**）—— 4 级 python 定位链，全运行时派生（见 §2.3） |
| `plugins\dsh-tool-python\package.json` | 已扫描（**无命中**） |

### 1.6 其他

| 文件 | 结果 | 说明 |
|---|---|---|
| `personal-hub\personal.json` | 已扫描（命中 1 处：DSH_HOME=1，注释） | 机器无关 ✓；`dsh-deepseek-balance` 的 patch **只有 comment 无 config**（§4.9） |
| `personal-hub\personal.local.json` | 已扫描（命中 8 处：DRIVE=4, ADMIN=1, PWSH_HARD=1, DEEPSEEK_DSH=2） | **机器特定，gitignore**；含 pythonPath / pwshPath / extraDependencies（见 §3.5、§3.6） |
| `.gitignore` | 已扫描（命中 1 处：DEEPSEEK_DSH=1） | 排除项与 bootstrap/运行期生成一一对应（见 §6.2） |
| `config\settings.yaml` | 已扫描（**无命中**） | 模板无绝对路径 ✓ |
| `config\AGENTS-global-template.md` | 已扫描（命中 2 处：DEEPSEEK_DSH=1, DSH_HOME=1） | 仅说明性文本 |

---

## 2. BLOCKER 详述

### 2.1 BLOCKER-1：升级链依赖「平级官方 checkout」，新机不存在

**脚本层的路径约定**（三处一致，都是 `Split-Path $ops -Parent`）：

| 文件:行 | 原文片段 |
|---|---|
| `update-dsh.ps1:5-6` | `# 路径约定：本脚本位于 <root>\DSH-ops，官方仓库为同级 <root>\Deepseek_DSH，盘符任意，仅要求两仓库同父目录。` |
| `update-dsh.ps1:8` | `$repo = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'` |
| `update-dsh.ps1:18-21` | `if (-not (Test-Path (Join-Path $repo '.git'))) { Write-Both "错误: 未找到仓库 $repo"; exit 1 }` |
| `update-dsh.ps1:142` | `git -C $repo ... fetch origin` |
| `update-dsh.ps1:249` | `& (Join-Path $ops 'sync-official.ps1')` （无参数 → 走需要官方目录的分支） |
| `sync-official.ps1:37` | `$official = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'` |
| `sync-official.ps1:44` | `if (-not (Test-Path (Join-Path $official '.git'))) { throw "官方仓库缺失: $official" }` |
| `check-update.ps1:6` | `$repo = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'` |
| `new-plugin.mjs:37` | `const repoDir = join(dirname(opsDir), 'Deepseek_DSH')` |
| `plugins\dsh-deepseek-balance\index.js:33` | `const REPO_DIR = join(dirname(OPS_DIR), 'Deepseek_DSH')` |

**新机的实际布局**（`bootstrap-personal.ps1:31-32,40-46`）：

```
$repo = $PSScriptRoot                     # <个人仓库根>\DSH-ops
$copy = Join-Path $repo 'Deepseek_DSH'    # <个人仓库根>\DSH-ops\Deepseek_DSH  ← bootstrap 只创建这一个
git clone --depth 1 $OfficialUrl $copy
```

→ **bootstrap 把官方源码 clone 到 `DSH-ops` 内部**，与 `update-dsh.ps1` 期望的「平级」路径**不是同一个目录**。

**DEPLOY.md 的立场**（A 队范围，此处仅作交叉证据）：
- `DEPLOY.md:47` 新机唯一 clone 命令是 `git clone https://github.com/liaojiawei0428/dsh-ops.git ceshi` —— **没有 clone 官方到平级目录的步骤**。
- `DEPLOY.md:21` 承认存在「`<个人仓库根>/Deepseek_DSH` 之外的独立克隆」，但**全文未给出创建它的命令**。
- `DEPLOY.md:132` 却把「双击 更新DSH.bat」列为日常维护操作。

**新机为何失效**：
`更新DSH.bat:7` → `update-dsh.ps1` → `Test-Path <root>\Deepseek_DSH\.git` 为假 → `exit 1`，输出「错误: 未找到仓库 …」。
`sync-official.ps1`（`DEPLOY.md:133` 推荐）→ `throw 官方仓库缺失`。
`check-update.ps1` → `git -C <不存在的目录> fetch` 返回非 0 → 打印「网络通道已就绪…但访问 GitHub 失败 / 可能是 VPN 节点失效」（`check-update.ps1:19-21`）→ **把路径错误误报成网络故障**，且 `启动DSH.bat:8` 每次启动都会显示这条误导信息。

**严重度**：BLOCKER（阻断升级链，且错误信息误导排查方向）。

**建议修法**（择一，推荐 A）：
- **A. 统一到副本**：把 `update-dsh.ps1:8`、`check-update.ps1:6`、`sync-official.ps1:37` 的定位改为「优先平级官方目录，缺失则用副本 `<ops>\Deepseek_DSH`」，并在用副本时跳过「官方→副本 robocopy 同步」（副本即源，无需同步）。
- **B. 补文档**：在 `DEPLOY.md` 第 1 步后增加一条 `git clone --depth 1 <官方> <个人仓库根>/Deepseek_DSH`，使平级目录成为**必需**部署物；同时在 `DEPLOY.md:21` 写明「升级链必需」而非「只在升级时使用」。
- 无论哪条，都应在 `update-dsh.ps1:18-21` 的报错里补上「该目录是升级用的官方 checkout，新机需先 clone」的具体命令。

### 2.2 BLOCKER-2：`node.exe` 绝对路径硬编码 4 处

| 文件:行 | 原文片段 | 用途 |
|---|---|---|
| `start-dsh-web.ps1:127` | `& 'C:\Program Files\nodejs\node.exe' (Join-Path $ops 'validate-plugins.mjs')` | 启动前插件闸门 |
| **`start-dsh-web.ps1:183`** | `$p = Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' \` | **启动服务本体** |
| `start-dsh-web.ps1:242` | `& 'C:\Program Files\nodejs\node.exe' (Join-Path $ops 'disable-plugin.mjs') $broken` | 坏插件自动隔离 |
| `update-dsh.ps1:284` | `& 'C:\Program Files\nodejs\node.exe' (Join-Path $ops 'validate-plugins.mjs')` | 升级前插件闸门 |

**机器相关性**：真机特定（本机node 恰好在 `C:\Program Files\nodejs`，实证 `shutil.which('node')` = `C:\Program Files\nodejs\node.EXE`）。
**同一份代码内部的不一致（反证）**：`watchdog-dsh.ps1:173-174` 明确写了定位链并注释「禁止写死——本机安装位置可能非标准」：

```powershell
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }
```

说明作者已识别该风险，但只修了看门狗，没修启动链与升级链。

**新机为何失效**：新机若用 nvm-windows（`%APPDATA%\nvm\v22.x\node.exe`）、fnm、volta、scoop、或 32 位 Node（`C:\Program Files (x86)\nodejs\node.exe`），该路径不存在：
- `update-dsh.ps1` 顶层 `$ErrorActionPreference='Stop'` → `& '<不存在的 exe>'` 抛 `CommandNotFoundException` → **升级脚本中止**（升级链二次阻断）。
- `start-dsh-web.ps1` 顶层是 `'Continue'` → L183 `Start-Process` 报「系统找不到指定的文件」后继续 → `$p` 为 `$null` → 后续 `$p.Id`/`Stop-Process -Id $null` 均无效 → 端口 30 秒无监听 → 3 次尝试后 `exit 1`「启动失败: 3 次尝试均未成功」。**服务完全无法启动。**

**严重度**：BLOCKER（新机 node 非标准位置 = 服务起不来）。
**建议修法**：抽出与 `watchdog-dsh.ps1:25-37` 同款的 `Resolve-NodePath`（`Get-Command node` → `$env:ProgramFiles\nodejs\node.exe` → `$env:ProgramFiles(x86)\nodejs\node.exe` → 报错并提示安装 Node），在 4 处统一使用；或在文件头解析一次 `$node = (Get-Command node).Source` 并做存在性校验后 fail-loud。

---

## 3. INCONSISTENT 详述

### 3.1 INCONSISTENT-1：bat 入口只用裸 `pwsh.exe`（点 5 判定）

| 文件:行 | 原文片段 |
|---|---|
| `启动DSH.bat:8` | `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-update.ps1"` |
| `启动DSH.bat:11` | `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dsh-web.ps1" -Restart` |
| `更新DSH.bat:7` | `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-dsh.ps1"` |

对照 `health-check.cmd:11-19` 的完整定位链：

```
for /f "delims=" %%i in ('where pwsh 2^>nul') do if not defined PWSH set "PWSH=%%i"
if not defined PWSH if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PWSH=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not defined PWSH if exist "%LocalAppData%\Microsoft\WindowsApps\pwsh.exe" set "PWSH=%LocalAppData%\Microsoft\WindowsApps\pwsh.exe"
if not defined PWSH if exist "E:\GongJu\7\pwsh.exe" set "PWSH=E:\GongJu\7\pwsh.exe"
if not defined PWSH ( echo [health-check] PowerShell 7 not found. Install it, then retry. & exit /b 2 )
```

**`health-check.cmd:15` 那行的含义与实证**：它是「本机自定义安装根」的硬编码回退。本机实测：
- PATH 含 `E:\GongJu\7` → `where pwsh` 命中 `E:\GongJu\7\pwsh.EXE`；
- `C:\Program Files\PowerShell\7\pwsh.exe` **不存在**（`Resolve-PwshPath` 的注释也印证：「2026-08-31：写死 Program Files 路径在本机不存在」）。

所以 L15 在本机**从未生效**（被 L11 抢先），它是机器特定的冗余回退 —— 判 NIT（见 §5 NIT-3），但它的存在恰好证明「标准位不可依赖」。

**新机为何失效**：`启动DSH.bat` / `更新DSH.bat` 没有这层回退。若新机 pwsh 7 装在非 PATH 位置（便携解压、自定义目录），或只有系统自带 Windows PowerShell 5.1，双击 bat 会直接打印 `'pwsh.exe' 不是内部或外部命令`，**既不启动也不给安装指引**（`pause` 只在 `errorlevel 1` 分支里，而命令未找到时 `errorlevel` 为 9009，也能触发 pause，但提示文案是「DSH server failed to start」，误导）。

**严重度**：INCONSISTENT（脚本层已有成熟修法可复制，属可回退性缺口）。
**建议修法**：把 `health-check.cmd:10-20` 的定位块抽成 `find-pwsh.cmd`，三个入口 bat 均 `call` 它；找不到时打印「请安装 PowerShell 7：winget install Microsoft.PowerShell」。

### 3.2 INCONSISTENT-2：`update-dsh.ps1` 不尊重 `DSH_HOME`（点 6 判定）

| 文件:行 | 原文片段 |
|---|---|
| `update-dsh.ps1:105` | `$credPath = Join-Path $env:USERPROFILE '.dsh\.credentials.yaml'` |
| `update-dsh.ps1:110` | `Write-Both "恢复: 从 $env:USERPROFILE\.dsh\backups\<时间戳>\ 复制最近的备份"` |
| `update-dsh.ps1:117` | `$backupDir = Join-Path $env:USERPROFILE ("\.dsh\backups\" + ...)` |
| `update-dsh.ps1:120` | `$p = Join-Path $env:USERPROFILE ".dsh\$f"` |
| `update-dsh.ps1:123` | `$profPkg = Join-Path $env:USERPROFILE '.dsh\profiles\web\package.json'` |
| `health-check.py:35` | `PROF_PKG = Path.home() / ".dsh" / "profiles" / "web" / "package.json"` |

**尊重 `$DSH_HOME` 的对照组**（同一套工具链里的正确样板）：

| 文件:行 | 原文片段 |
|---|---|
| `bootstrap-personal.ps1:73` | `$dshHome = if ($env:DSH_HOME -and $env:DSH_HOME.Trim() -ne '') { $env:DSH_HOME } else { Join-Path $userProfile '.dsh' }` |
| `watchdog-dsh.ps1:150-151` | `$rerunHome = $env:DSH_HOME` / `if (-not $rerunHome …) { $rerunHome = Join-Path $env:USERPROFILE '.dsh' }` |
| `validate-plugins.mjs:47` | `process.env.DSH_HOME !== undefined ? resolve(process.env.DSH_HOME, 'profiles/web') : resolve(homedir(), '.dsh/profiles/web')` |
| `disable-plugin.mjs:28` | `resolve(process.env.DSH_HOME ?? resolve(homedir(), '.dsh'), 'profiles/web')` |
| `check-plugin-copy.mjs:37` | `join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'web')` |
| `plugins\dsh-personal-hub\index.js:236-242` | `process.env.DSH_HOME … : path.join(homedir(), '.dsh')` |

**为何是新机问题**：`DEPLOY.md:38-39` 明确建议演练/隔离部署设 `DSH_HOME=<隔离目录>`。此时：
- `update-dsh.ps1:107` 校验的是**真实 `~/.dsh/.credentials.yaml`**；
- `:117-124` 把**真实 `~/.dsh`** 备份到真实 `~/.dsh/backups`；
- `:271-278` 的 profile 组合预检读的是**真实 `~/.dsh/profiles/web/package.json`**，而 reapply 写入的是 `$DSH_HOME/profiles/web` → **预检对象与实际运行 profile 不是同一个**，闸门形同失效（假绿）。
- `health-check.py:205-209` 的 bundles 完整性检查同样读错 profile。

严格说这不是「换机失效」而是「换 DSH_HOME 失效」，但它直接破坏 DEPLOY.md 推荐的隔离演练路径，且是**同一套脚本内部行为不一致**，故列 INCONSISTENT。
**严重度**：INCONSISTENT。
**建议修法**：在 `update-dsh.ps1` 顶部引入与 `bootstrap-personal.ps1:73` 相同的解析（`$dshHome = …`），把 105/110/117/120/123 五处 `$env:USERPROFILE` 换成 `$dshHome`；`health-check.py:35` 改为 `Path(os.environ.get("DSH_HOME") or (Path.home()/".dsh"))/"profiles"/"web"/"package.json"`。

### 3.3 INCONSISTENT-3：bootstrap 模板缺 `extraDependencies` → computer-use 装配与开发机不同（点 6 核心）

**bootstrap 生成的模板**（`bootstrap-personal.ps1:77-90`）只有 `extraPatches` 一项：

```powershell
$local = @{
  _comment = '本机覆盖层（gitignore, 各机器自建）: 机器特定绝对路径。'
  extraPatches = @(
    @{ id = 'pwsh-sandbox'; name = '@deepseek-ai/dsh-pwsh-sandbox'; config = @{ pwshPath = $pwshPath } }
  )
} | ConvertTo-Json -Depth 5
```

**开发机的 `personal.local.json`（gitignore，新机拿不到）多出两块**：

| 行 | 内容 |
|---|---|
| `personal.local.json:3-13` | `plugins[]` → `dsh-tool-python.patch.config.pythonPath` = `C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe` |
| `personal.local.json:14-22` | `extraPatches[]` → `pwsh-sandbox.config.pwshPath` = `E:\GongJu\7\pwsh.exe` |
| `personal.local.json:25-28` | **`extraDependencies`** → 两条 `link:E:/DSH/DSH-ops/Deepseek_DSH/packages/...` |

**`extraDependencies` 为何必需**（源码证据）：
- `plugins\dsh-computer-use\cordis.patch.yml:14-18` 用**裸包名**插入两行：
  ```yaml
  - insert:
      - id: computer-use
        name: '@deepseek-ai/dsh-computer-use'
      - id: computer-use-cua-driver-native
        name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
  ```
- `plugins\dsh-personal-hub\index.js:556-563` 的注释直接说明了原因：
  > 「a bundle patch can insert an official package row whose bare name resolves against the CONFIG DIRECTORY (app-boot's `boot()`), not against the install anchor; without a profile-level dependency that row fails with `failed to import`.」
- `plugins\dsh-personal-hub\index.js:564-569` 的 `expectedDependencies()` 把 `manifest.extraDependencies` **原样抄进 profile 的 `dependencies`**，并把 `dependencies` **整体替换**（`:708 livePackage.dependencies = expectedDependencies(manifest)`）。

**开发机基准**（只读导出 `C:\Users\Administrator\.dsh\profiles\web\package.json`）确实含这两条：

```json
"@deepseek-ai/dsh-computer-use": "link:E:/DSH/DSH-ops/Deepseek_DSH/packages/computer-use/computer-use",
"@deepseek-ai/dsh-experimental-computer-use-cua-driver-native": "link:E:/DSH/DSH-ops/Deepseek_DSH/packages/experimental/computer-use-cua-driver-native"
```

**新机后果（已核对启动策略，严重度已定档）**：
- `/boot/app-boot` 的失败收集把无法解析的 entry 记为 `outcome: {kind:'failed', error:'failed to import'}`（`Deepseek_DSH/packages/boot/app-boot/src/index.ts:781`）；
- 但启动策略只对 `requiredStartupEntryIds` 内的 id 抛错：`index.ts:691-699` = `['agent-loop','webserver','modules','connection','headless-runner','acp','sdk-jsonrpc-server']`，**不含 computer-use**；
- `index.ts:875-883`：`required.size > 0` 才 `throw StartupError`，否则 `warn(activationDiagnostic(...))`。
- **∴ 新机服务能起来，但 computer-use 功能不可用，启动日志出现 warning** —— 不是 BLOCKER，是「部署结果与开发机不同」。
- **更隐蔽的一点**：`plugins\dsh-personal-hub\index.js:572-590` 的 `statusReport` 只比对「清单期望项是否在 profile 里」和「profile 里是否有多余项」。新机清单里**没有** extraDependencies，profile 里也没有 → **drift 为空**，reapply 报「复检无漂移」。DEPLOY.md 的期望输出（`DEPLOY.md:86` `{ "ok": true, …, "复检无漂移" }`）会**假绿**。

**严重度**：INCONSISTENT（不阻断启动，但装配结果与开发机不同且无任何提示）。
**建议修法**：
1. 短期：在 `bootstrap-personal.ps1:80-87` 的模板里补 `extraDependencies`，值用**运行时派生**的副本路径（`toPosix(Join-Path $copy 'packages/computer-use/computer-use')` 等），而不是写死盘符；
2. 长期更稳：给 `dsh-computer-use` 的 `cordis.patch.yml` 换成**不依赖 profile 依赖解析**的写法（或让 personal-hub 在 `validateManifest` 里对「patch 插入官方裸包名」与 `extraDependencies` 做交叉校验，缺失即 fail-loud，把假绿变成真红）。

### 3.4 INCONSISTENT-4：bootstrap 模板缺 `pythonPath` + 两条 python 定位链覆盖不一致（点 4 判定）

**`plugins\dsh-tool-python\index.js` 的定位链（4 级，全运行时派生，无绝对路径硬编码）**：

| 级别 | 行 | 内容 |
|---|---|---|
| 0 | `index.js:68-73` | `process.env.DSH_PYTHON_PATH` |
| 1 | `index.js:75-76` | `probePython('py', ['-3'])` |
| 2 | `index.js:78-79` | `probePython('python')`（**probe 验证，Store 桩被拒**） |
| 3 | `index.js:51-57, 81-91` | 扫描 `%LOCALAPPDATA%\Programs\Python`、`%ProgramFiles%`、`%ProgramFiles(x86)%` 下的 `^Python3\d*` 目录 |

**`health-check.ps1` 的定位链（4 级）**：

| 级别 | 行 | 内容 |
|---|---|---|
| 1 | `health-check.ps1:36-47` | `personal-hub\personal.local.json` → `plugins[].patch.config.pythonPath` |
| 2 | `health-check.ps1:49-55` | `py -3 -c "import sys; print(sys.executable)"` |
| 3 | `health-check.ps1:57-61` | PATH 中**排除 `WindowsApps`** 的 `python.exe` |
| 4 | `health-check.ps1:63-70` | `%LOCALAPPDATA%\Programs\Python` **和 `%LOCALAPPDATA%\Python`** 递归找 `python.exe` |

**两者覆盖差异（本机实证）**：

| 探测项 | 实测结果 |
|---|---|
| `shutil.which('python')` | `C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\python.exe`（**0 字节 App Execution Alias**） |
| `shutil.which('py')` | `C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\py.exe`（同样 0 字节别名） |
| 裸 `py -3 -c …` | **rc=0**，`sys.executable` = `…\AppData\Local\Python\pythoncore-3.14-64\python.exe`（本机别名已被真实 Python 激活） |
| 裸 `python -c …` | **rc=0**，同上 |
| `%LOCALAPPDATA%\Programs\Python` | **不存在** |
| `%LOCALAPPDATA%\Python\` | **存在**，含 `pythoncore-3.13-64`、`pythoncore-3.14-64`、`bin` |
| `%ProgramFiles%` 下 `Python3*` | **无** |

**由此得出的两条结论**：

1. **本机 pythonPath 的绝对锁定（`personal.local.json:9`）目前是"冗余保险"而非必需** —— 因为裸 `py`/`python` 恰好可用。但它锁定的路径 `C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe` 是**用户名 + 版本双特定**的，新机必然不同。
2. **`dsh-tool-python` 的发现链覆盖不到 `%LOCALAPPDATA%\Python`**：`pythonInstallRoots()`（`index.js:51-57`）只给 `LOCALAPPDATA\Programs\Python`；就算加上 `%LOCALAPPDATA%\Python`，`:83` 的 `/^Python3\d*/i` 也匹配不到 `pythoncore-3.14-64`。而 `health-check.ps1:63` **覆盖了这个位置**。
   → 存在这样一类新机：**体检找得到 python，而 `python` 工具报「未找到可用的 Python 3」**（`index.js:406-407` 的 fail-loud 文案），条件是「Python 装在 py-launcher/NuGet 布局的 `%LOCALAPPDATA%\Python\pythoncore-*`，且裸 `py`/`python` 不可用」。

**新机为何与开发机不同**：bootstrap 模板不含 `pythonPath`（`bootstrap-personal.ps1:80-87`）→ 新机 profile 的 `tool-python` patch 没有 config 覆盖 → 完全依赖运行时发现。开发机则是绝对锁定。**行为差异 + 定位链盲区叠加。**
**严重度**：INCONSISTENT（不阻断启动；`python` 工具在特定布局下不可用，且报错信息不会提示"改 pythonPath"以外的具体原因）。
**建议修法**：
1. `bootstrap-personal.ps1` 生成模板时，若能解析到 python（可直接复用 `health-check.ps1` 的定位链逻辑），把 `pythonPath` 一并写进 `plugins[]`；
2. `plugins\dsh-tool-python\index.js:51-57` 的 roots 增加 `join(LOCALAPPDATA,'Python')`，`:83` 的正则放宽为 `/^Python3[\d.]*$|^pythoncore-/i`（注意该文件属插件，改动须过 `node validate-plugins.mjs` 闸门）。

### 3.5 INCONSISTENT-5：全链 3080 硬编码 vs DEPLOY.md 的改端口建议（点 6）

| 文件 | 命中行 | 片段示例 |
|---|---|---|
| `start-dsh-web.ps1` | `:135,143,146,147,150,157,165,197,207,223`（12 处含注释） | `Get-NetTCPConnection -State Listen -LocalPort 3080` |
| `update-dsh.ps1` | `:295,308,336,345` | `Invoke-WebRequest -Uri 'http://127.0.0.1:3080'` |
| `watchdog-dsh.ps1` | `:123,133,135,140` | `Get-NetTCPConnection -State Listen -LocalPort 3080` |
| `health-check.py` | `:34`（+ `:10` 注释） | `PORT = 3080` |
| `.g5-observer.ps1` | `:4` | `-LocalPort 3080` |
| `bootstrap-personal.ps1` | `:109` | 提示文案 |
| `lib-proxy.ps1` | `:97` | `$env:NO_PROXY = 'localhost,127.0.0.1,::1'`（回环，合理） |

**冲突点**：`DEPLOY.md:124` 写「若 3080 已被本机其他 DSH 占用，可临时让演练实例用其他端口（改 `settings.yaml` 的 webServer port，或先停其他实例）」。但脚本层的 3080 是**字面常量、无任何配置入口**：
- 改了 settings.yaml 端口后，`start-dsh-web.ps1:157` 仍按 3080 判断「已在运行」→ 会**另起一个进程**或误判「启动失败」；
- `watchdog-dsh.ps1:133` 永远看不到 3080 → **把健康服务判死，每 60 秒隔离插件 + 拉起启动链**（`watchdog-dsh.ps1:169-201`），造成反复重启；
- `update-dsh.ps1:336` 健康检查永远失败 → 升级以「服务 120 秒内未就绪」告终。

**严重度**：INCONSISTENT（只在端口冲突场景暴露，但后果是看门狗自杀式重启）。
**建议修法**：给脚本链引入统一的端口解析（环境变量 `DSH_WEB_PORT` 优先，其次读 `settings.yaml`，最后默认 3080），或在 `DEPLOY.md:124` 改为「必须停掉占用 3080 的实例，脚本链不支持换端口」。

### 3.6 INCONSISTENT-6：4 个核心 `.ps1` 缺 UTF-8 BOM（点 8）

**仓库自定规则**：
- `lib-proxy.ps1:3` — `# 所有文件均为 UTF-8 带 BOM（Windows PowerShell 5.1 需要）。`
- `DSH-ops/AGENTS.md` 准则 5 — 「改动 `.ps1` 后：语法检查 + **补回 UTF-8 BOM** + 确认无 `powershell.exe`」

**实测（逐个读字节）**：

| 文件 | BOM | 中文字符数 | 换行 |
|---|---|---|---|
| `bootstrap-personal.ps1` | **无** | **521** | LF-only |
| `start-dsh-web.ps1` | **无** | **1617** | CRLF |
| `update-dsh.ps1` | **无** | **2202** | CRLF |
| `watchdog-dsh.ps1` | **无** | **1397** | LF-only |
| `sync-official.ps1` | 有 ✓ | 500 | LF-only |
| `check-update.ps1` | 有 ✓ | 228 | CRLF |
| `health-check.ps1` | 有 ✓ | 171 | LF-only |
| `lib-proxy.ps1` | 有 ✓ | 665 | LF-only |
| `.g5-observer.ps1` | 有 ✓ | 0 | CRLF |

**风险链（与 3.1 联动）**：`pwsh 7` 读取无 BOM 的 UTF-8 文件按 UTF-8 处理 → **本机正常**。但一旦落到 Windows PowerShell 5.1（新机 bat 裸 `pwsh.exe` 未命中 PATH、用户手动改用 `powershell.exe`、或某些自动化以 5.1 调起），5.1 会按 **ANSI/GBK** 解码无 BOM 文件 → 中文注释与输出串乱码，严重时触发 ParserError。该故障类型在本仓有历史记录（buglog `2026-08-23-powershell-5-1-start-web-ps1-p4-parserer`：`start-dsh-web.ps1` P4 ParserError）。

**新机为何更危险**：新机是「首次安装 pwsh 7」的机器，PATH 未就绪的概率最高；而这两个 bat 恰好只用裸名。
**严重度**：INCONSISTENT（pwsh 7 路径下不失效；是规则违反 + 5.1 回退脆弱）。
**建议修法**：给这 4 个文件补 UTF-8 BOM（保持 LF/CRLF 现状不变），并把「BOM 检查」纳入 `test-standard.mjs` 或 `health-check.py`，防止再次丢失。

### 3.7 INCONSISTENT-7：`health-check.py` 用裸 `pwsh`/`node` 且无异常处理

| 文件:行 | 原文片段 |
|---|---|
| `health-check.py:54-55` | `def run(cmd, cwd=None, timeout=30): return subprocess.run(cmd, …)` — **无 try/except** |
| `health-check.py:104` | `wd = run(["pwsh", "-NoProfile", "-Command", ps])` |
| `health-check.py:164` | `r = run(["pwsh", "-NoProfile", "-Command", …])`（WMI 中继复活看门狗） |
| `health-check.py:177` | `wd2 = run(["pwsh", "-NoProfile", "-Command", ps])` |
| `health-check.py:228` | `r = run(["node", script], cwd=OPS, timeout=120)`（闸门 + 回归） |

**讽刺点**：`health-check.cmd` 花 4 级定位链找到 pwsh，`health-check.ps1` 花 4 级定位链找到 python —— 但 `health-check.py` 内部又退回裸 `pwsh`/`node`。新机若把 pwsh/node 装在非 PATH 位置，体检会在 `:104` 抛 `FileNotFoundError` 并以 traceback 结束，而**不是**给出一条可诊断的「未找到 pwsh」。
（`health-check.py:152-153`/`:166-167` 的中继脚本内部**有** pwsh 定位链，说明作者知道该风险，只是没覆盖 python 侧的裸调用。）
**严重性**：INCONSISTENT。
**建议修法**：`run()` 外层捕获 `FileNotFoundError`，返回带 `returncode=-1` 的合成结果并在各段 `fail("未找到 pwsh/node，请检查 PATH")`；或让 `health-check.ps1` 把已定位到的 pwsh 路径通过环境变量传给 `health-check.py`。

### 3.8 INCONSISTENT-8：余额胶囊的平级布局假设

| 文件:行 | 原文片段 |
|---|---|
| `plugins\dsh-deepseek-balance\index.js:27-33` | 注释：`any drive letter works as long as the sibling layout holds: <root>/Deepseek_DSH (official repo) / <root>/DSH-ops` → `const REPO_DIR = join(dirname(OPS_DIR), 'Deepseek_DSH')` |
| `plugins\dsh-deepseek-balance\index.js:173` | `JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'))`（读版本号） |
| `plugins\dsh-deepseek-balance\index.js:177-179` | `await git(repoDir, ['fetch','origin'])` / `rev-parse HEAD` / `rev-parse origin/master` |
| `plugins\dsh-deepseek-balance\index.js:253` | `const script = join(opsDir, 'update-dsh.ps1')`（胶囊上的升级按钮） |
| `plugins\dsh-deepseek-balance\index.js:363-365` | `const repoDir = config.repoDir ?? REPO_DIR` —— **可配置，但没配** |
| `personal-hub\personal.json:12-16` | `{ "name": "dsh-deepseek-balance", "patch": { "comment": "…repoDir/opsDir derive from the sibling layout automatically." } }` —— **只有 comment，无 config** |

**新机后果**：个人工具栏上的「DSH 版本」胶囊无法显示版本、更新检查恒失败；点击升级按钮 → `update-dsh.ps1` → BLOCKER-1 的 `exit 1`。
注意 `OPS_DIR`（`:36-39`）是**从自身位置派生、盘符自由** ✓，问题只在 `REPO_DIR` 这一层平级假设。
**严重度**：INCONSISTENT（功能缺口，面向上层 UI，不阻断启动）。
**建议修法**：在 `personal-hub/personal.json` 给 `dsh-deepseek-balance` 增加 `patch.config.repoDir`（值应为运行时派生的副本路径），或让插件默认改为「平级官方目录存在则用，否则回落 `<ops>/Deepseek_DSH`」。

### 3.9 INCONSISTENT-9：`check-update.ps1` 把「目录不存在」误报成网络故障

| 文件:行 | 原文片段 |
|---|---|
| `check-update.ps1:17` | `git -C $repo -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=10 fetch origin 2>$null` |
| `check-update.ps1:19-21` | `'[更新检查] 网络通道已就绪 (系统代理或直连), 但访问 GitHub 失败'` / `'…可能是 VPN 节点失效或网络波动, 请切换节点后重试'` |

新机上 `$repo` 不存在，`git -C` 返回 128，脚本据此断言「网络问题」→ 引导用户去切 VPN，**方向完全错误**。且 `启动DSH.bat:8` 每次启动都会执行它。
**附带的脆弱点**：`check-update.ps1:25` 用 `origin/master` 但在 `:26` 有长度防护（`$local.Length -lt 12`）；而 `update-dsh.ps1:149-151` 同样取 `origin/master` **没有**防护 —— 若官方默认分支改名，`$remote` 为空，`$remote.Substring(0,12)` 在 `$ErrorActionPreference='Stop'` 下抛终止错误。
**严重度**：INCONSISTENT（误导排查 + 潜在硬崩）。
**建议修法**：`check-update.ps1` 在 `:17` 前先 `if (-not (Test-Path (Join-Path $repo '.git'))) { Write-Host '[更新检查] 未找到官方仓库 <path>，跳过' ; exit 0 }`；`update-dsh.ps1:150-151` 补长度校验并给出「默认分支可能已改名」的提示。

---

## 4. 逐项判定（任务点 3-9 的明确结论）

### 4.1 点 3：`update-dsh.ps1` / `sync-official.ps1` / `lib-proxy.ps1` 是否假设平级官方目录？

| 脚本 | 判定 | 证据 |
|---|---|---|
| `update-dsh.ps1` | **成立（硬依赖，BLOCKER）** | `:5-6` 注释约定；`:8` `Split-Path $ops -Parent`；`:18-21` 缺则 `exit 1`；`:142` 用它 fetch；`:249` 调 `sync-official.ps1` 无参（需要官方目录的分支） |
| `sync-official.ps1` | **成立（硬依赖）** | `:5-6` 注释写死 `E:\DSH\Deepseek_DSH` 与 `E:\DSH\DSH-ops\Deepseek_DSH`；`:37` 平级 `$official`；`:44` 缺则 `throw`。**注意例外**：`-ApplyPatchesOnly` 模式（`:43`）跳过官方同步，该模式下不需要官方目录 |
| `lib-proxy.ps1` | **不成立（反证）** | 全文无 `Deepseek_DSH`、无盘符路径（§1.1 显示 **0 命中**）。它只做：注册表读系统代理（`:12`）、直连 HTTPS 探测（`:68`）、设置/清理代理环境变量（`:91-98`）。是三个脚本里最干净的一个 |

**交叉验证**：`bootstrap-personal.ps1:32` 把官方源码 clone 到 `<ops>\Deepseek_DSH`（**内部**），与 `update-dsh.ps1:8` 的 `<ops>\..\Deepseek_DSH`（**平级**）是**两个不同目录**。开发机上平级目录恰好存在（历史上手工 clone，见用户全局 `AGENTS.md`「harness 源码 checkout：`E:\DSH\Deepseek_DSH`」），所以本机永不出错；新机按 DEPLOY.md 部署则**永远不会**出现该目录。

### 4.2 点 4：python 定位链

- `health-check.ps1`：4 级定位链（`:36-70`），有 `#Requires -Version 7`（`:1`），无绝对路径 → **可移植** ✓
- `health-check.py`：不定位 python（由 ps1 传入），但裸调 `pwsh`/`node`（§3.7）
- `plugins\dsh-tool-python`：4 级发现链（`index.js:67-93`），**probe 验证拒绝 Store 桩**（`:37-47`，判据是 `lines[0] !== '3'` + 异常即 `undefined`），无绝对路径 → **设计上可移植、且特意处理了 Store 桩** ✓
- **裸 `python` 会不会命中 MS Store 桩？** 会解析到 `%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe`（实测 `shutil.which` 证实），但**本机该别名已被真实 Python 激活**，实测 `python -c` rc=0。这是一个**随机器状态变化**的行为：桩是否失败取决于新机是否装了真实 Python 并被别名接管。两处代码都对此做了防御（ps1 排除 `WindowsApps` 路径；插件用 probe 验证），结论：**裸名风险已被显式处理，不是缺口**。
- **新机没有本机 `pythoncore-3.14` 路径时的行为**：`health-check.ps1` 退到第 2/3/4 级（第 4 级含 `%LOCALAPPDATA%\Python`，能覆盖 py-launcher 布局）；`dsh-tool-python` 退到第 4 级但**不含该根目录**（§3.4）→ 覆盖差集就是缺口。

### 4.3 点 5：pwsh 定位链

- `health-check.cmd`：**有**定位链（`:11-15`）+ 回退 + 友好报错（`:16-19`）✓
- `启动DSH.bat` / `更新DSH.bat`：**只有裸 `pwsh.exe`**（`:8,11` / `:7`），依赖 PATH，无回退、无安装指引 → **新机风险成立**（§3.1）
- `health-check.cmd:15` 的 `E:\GongJu\7\pwsh.exe`：机器特定回退，本机从未生效（PATH 先命中），属冗余 → NIT
- `start-dsh-web.ps1:70-82` 与 `watchdog-dsh.ps1:25-37` 各自实现了 `Resolve-PwshPath`（`DSH_PWSH_PATH` → PATH → Program Files 两处），**是最好的样板** —— 说明团队已有正确解法，只是没铺到 bat 入口

### 4.4 点 6：端口 / 地址 / profile / DSH_HOME 解析

| 维度 | 结论 |
|---|---|
| 端口 | `3080` 全链字面常量（§3.5），无配置入口 |
| 地址 | `127.0.0.1` 硬编码；`lib-proxy.ps1:97` 把它放进 `NO_PROXY`（**正确的防御**，对应 buglog `health-check-via-system-proxy-502-loop`） |
| profile 名 | `web` 全链字面常量。与 DSH 默认一致，故不失效；但不可配置 |
| `DSH_HOME` | **不一致**：`bootstrap-personal.ps1:73`、`watchdog-dsh.ps1:150-151`、`validate-plugins.mjs:47`、`disable-plugin.mjs:28`、`check-plugin-copy.mjs:37`、`personal-hub/index.js:236-242` **尊重**；`update-dsh.ps1:105-123`（5 处）、`health-check.py:35` **写死** `$env:USERPROFILE\.dsh` / `Path.home()/".dsh"` |
| `start-dsh-web.ps1` | 0 处 `DSH_HOME` —— 不写死，靠 `Start-Process` 继承环境变量。**判定：可回退/无害**，但需注意从 bat 双击启动（新会话）时 DSH_HOME 不会被继承 |

### 4.5 点 7：「运行时派生、盘符自由」是否属实

| 组件 | 判定 | 证据 |
|---|---|---|
| `dsh-personal-hub` 的 `profileDir` | **属实** ✓ | `index.js:236-242`：`$DSH_HOME`（或 `homedir()/.dsh`）+ `profiles/web`，`toPosix` 归一 |
| `dsh-personal-hub` 的 `pluginsDir` | **属实** ✓ | `index.js:243-248`：由 `import.meta.url` 上溯三级 + `plugins` |
| 插件 `link:` 写法 | **属实** ✓ | `index.js:564-566`：`link:${manifest.pluginsDir}/${p.name}`，正斜杠、由运行时派生的 `pluginsDir` 拼出（只读比对：开发机 profile 为 `link:E:/DSH/DSH-ops/plugins/<name>`，形态一致） |
| `extraDependencies` 的 `link:E:/DSH/...` | **机器特定且在新机缺失** ✗ | `personal.local.json:26-27` 是**手写死路径**；`index.js:567` 原样抄写；bootstrap 模板不含该字段（§3.3） |
| bootstrap 模板是否导致新机与开发机不同 | **会** | 缺 `extraDependencies`（→computer-use 功能不可用，静默假绿）+ 缺 `pythonPath`（→退化为运行时发现，见 §3.4） |

**结论**：插件层（`dsh-personal-hub`）的路径推导**确实是运行时派生、盘符自由的** —— 但**清单覆盖度**没跟上：`personal.local.json` 里那两条 `link:E:/...` 既是机器特定，又是新机装配所必需，而 bootstrap 的模板不含它们。**问题在模板，不在派生逻辑。**

### 4.6 点 8：编码 / 语法可移植性

- **UTF-8 BOM**：4 个核心 `.ps1` 不合规（§3.6）——`bootstrap-personal.ps1`、`start-dsh-web.ps1`、`update-dsh.ps1`、`watchdog-dsh.ps1`
- **`powershell.exe` 出现 3 处，但判定为「不违规」**：
  | 文件:行 | 原文 | 判定 |
  |---|---|---|
  | `start-dsh-web.ps1:91` | `Get-CimInstance Win32_Process -Filter "Name='powershell.exe' OR Name='pwsh.exe'"` | 进程名匹配（单实例检测用），**非调用** → 无害 |
  | `start-dsh-web.ps1:112` | 同上（`$others` 单实例保护） | 同上 |
  | `watchdog-dsh.ps1:60` | 同上（看门狗单实例保护） | 同上 |
  （`health-check.py:96` 的同一模式亦属此类。）**本仓规则禁止的是用 `powershell.exe` 执行脚本，这 3 处只是 WMI 过滤条件，不构成违规。** 但值得加一行注释说明，避免后续审核误判。
- **bat/cmd 代码页**：`health-check.cmd`、`启动DSH.bat`、`更新DSH.bat` 均为**纯 ASCII（CJK 字符数 0）** → 无代码页依赖 ✓
- **中文输出**：4 个无 BOM 脚本含大量中文（521–2202 字符），是 5.1 下乱码/解析错误的载体

### 4.7 点 9：机器状态依赖

| 依赖项 | 实测/结论 |
|---|---|
| 计划任务 | **无**任何 DSH 相关任务（`Get-ScheduledTask` 过滤 `dsh|watchdog` → 空） |
| 注册表自启 | **无**（`HKCU\...\Run` 与 `HKLM\...\Run` 均无 DSH 项；启动文件夹只有 `QuickLook.lnk`） |
| 服务 | **无** DSH 相关 Windows 服务 |
| → 看门狗如何上岗 | 只由 `start-dsh-web.ps1:89-108 Ensure-Watchdog` 在**启动成功后**以 `Start-Process` 拉起（`:104`），或由 `health-check.py:149-184` 的 WMI 中继复活。**没有任何开机自启机制** → 新机必须人工启动一次 DSH，看门狗才会在岗；这点在 DEPLOY.md 中未覆盖（属 A 队范围，此处提供实证） |
| 已存在的 profile | `plugins\dsh-personal-hub\index.js:323-327` 要求 `profileDir/package.json` 存在，否则 `validateManifest` 报错；`bootstrap-personal.ps1:92-98` 会先创建骨架 → **新机可自举** ✓ |
| 已存在的 `dsh-web.pid` | `.gitignore:3` 排除；`update-dsh.ps1:296-315` 有「pid 文件可能缺失或过期 → 按端口 3080 找兜底」的处理 → **新机无此文件不影响** ✓ |
| `.gitignore` 是否排除新机必需文件 | **否**。`personal-hub/personal.local.json`（`.gitignore:11`）由 bootstrap 生成；`Deepseek_DSH/`（`:15`）由 bootstrap clone；`*.log`/`dsh-web.pid`/`backups/`/`watchdog.heartbeat`（`:1-5`）均为运行期产物；`node_modules/`（`:8`）由 pnpm install 生成 → **排除项与生成路径一一对应，无缺口**。真正的缺口是「bootstrap 生成的 `personal.local.json` **内容不完整**」（§3.3、§3.4），不是 gitignore 的问题 |

---

## 5. NIT 清单

| # | 文件:行 | 原文片段 | 机器相关性 | 为何在新机失效 / 说明 |
|---|---|---|---|---|
| NIT-1 | `start-dsh-web.ps1:12` | `$official = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'` | 真机特定（死变量） | 定义后**全文未使用**（`$repo` 用 `:13` 的副本路径）。是「平级官方目录」旧约定的残留，建议删除以免误导 |
| NIT-2 | `health-check.cmd:15` | `if not defined PWSH if exist "E:\GongJu\7\pwsh.exe" set "PWSH=E:\GongJu\7\pwsh.exe"` | 真机特定（可回退） | 本机实际由 `:11` 的 `where pwsh` 命中，该行从未生效；新机该路径不存在 → 仅浪费一次 `if exist` 判断，无害 |
| NIT-3 | `.g5-observer.ps1:1,6` | `$log = 'E:\DSH\DSH-ops\g5-drill.log'`、`Test-Path 'E:\DSH\DSH-ops\watchdog.heartbeat'` | 真机特定 | 演练辅助脚本。新机（盘符不同）会 `Out-File` 到不存在的目录，每 5 秒报一次错（`$ErrorActionPreference` 默认 Continue，不致命）。建议改用 `$PSScriptRoot` |
| NIT-4 | 15 个一次性脚本（见 §1.3） | 例：`fix-anthropic-group.cjs:6` `require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')`、`:16` `const src = 'C:/Users/Administrator/.dsh/settings.yaml'` | 真机特定 | 全部硬编码 `E:/DSH/...` + `C:/Users/Administrator/.dsh/...`。新机 100% 不可用。**不在部署链上**（开发机一次性运维产物），故列 NIT；但若新机需要重复这些操作（如 opencode 路由修补、`verify-*` 校验），则无脚本可用 —— 建议在 README 标注「开发机一次性脚本，不随部署迁移」 |
| NIT-5 | `verify-llm-section.mjs:4` | `import { resolveProfiles } from 'file:///E:/DSH/Deepseek_DSH/packages/llm/llm-pi-ai/lib/types/config.js'` | 真机特定 | ESM 绝对 `file:///` URL import，新机直接 `ERR_MODULE_NOT_FOUND` |
| NIT-6 | `plugins\dsh-github-push\client.js:615`（源：`src\client.js:574`） | `placeholder: "E:/DSH/DSH-ops"` | 真机特定 | UI 输入框占位符写死开发机路径，新机显示错误示例。建议改 `<你的 DSH-ops 目录>` |
| NIT-7 | `plugins\dsh-deepseek-balance\index.js:196` | 注释 `* path (E:\GongJu\7\pwsh.exe here; the default C:\Program Files\PowerShell\7` | 真机特定（仅注释） | 无害，但把开发机事实写进了共享代码，建议中性化描述 |
| NIT-8 | `plugins\dsh-deepseek-balance\index.js:210-211`、`plugins\dsh-restart-resume\index.js:91-92` | `const pf = process.env.ProgramFiles \|\| 'C:\\Program Files'` | 可回退 | 环境变量优先、常量兜底，判无害 ✓（与 BLOCKER-2 的**无条件硬编码**形成对比，可作修法样板） |
| NIT-9 | `plugins\dsh-server-ssh\client.js:554`（源 `src\client.js:533`） | `placeholder: "C:/Users/…/.ssh/id_ed25519"` | 无害 ✓ | 用了省略号 `…`，通用表达 |
| NIT-10 | `validate-plugins.mjs:209-210` | `cannot load core validator from …` / `(run "pnpm run build" in the DSH repo first, or set DSH_TOOLS_LIB)` | 可回退 ✓ | 行为正确（fail-loud），但文案对「新机 DSH repo 指的是 `DSH-ops\Deepseek_DSH` 副本」表述不清，建议改为「在 <ops>\Deepseek_DSH 运行 pnpm run build」 |
| NIT-11 | `new-plugin.mjs:37` | `const repoDir = join(dirname(opsDir), 'Deepseek_DSH')` | 真机特定 | 仅用于渲染 README 命令（`:128`）。新机生成的插件 README 会指向不存在的平级目录，误导后续维护者 |
| NIT-12 | `启动DSH.bat:22`、`更新DSH.bat:15` | `ping -n 4 127.0.0.1 >nul` | 无害 | 借用 ping 做 3 秒延时（不存在的地址也不会失败）。可用 `timeout /t 3` 替代但无实际风险 |
| NIT-13 | `start-dsh-web.ps1:91,112`、`watchdog-dsh.ps1:60` | `-Filter "Name='powershell.exe' OR Name='pwsh.exe'"` | 无害 | **澄清**：这是 WMI 进程名过滤，不是调用 `powershell.exe`，不违反本仓「恒用 pwsh 7」规则 |
| NIT-14 | `.plugin-deps.json`（仓库根） | — | 无害 | validate-plugins 的运行期产物（依赖图缓存），未被 `.gitignore` 排除 → 会进仓库。内容是机器无关的注入清单，无泄漏风险；建议加入 `.gitignore` 以免噪音 diff |

---

## 6. 「新机部署一致性」总判定

### 6.1 会阻断新机的（必须在部署前修）

1. **升级链完全不可用**（BLOCKER-1）—— `更新DSH.bat` / `sync-official.ps1` / `check-update.ps1` 全部依赖不存在的平级官方目录。
2. **服务可能根本起不来**（BLOCKER-2）—— 若新机 node 不在 `C:\Program Files\nodejs`，`start-dsh-web.ps1:183` 无法启动服务。

### 6.2 能部署但与开发机不同（静默差异，危害在于"看起来成功了"）

3. computer-use 功能缺失（§3.3），且 `reapply` 报「复检无漂移」→ **假绿**。
4. `python` 工具的发现链退化；在 py-launcher/NuGet 布局 + 裸名不可用的组合下不可用（§3.4）。
5. 「DSH 版本」胶囊失效（§3.8）。
6. 双击 bat 入口在 pwsh 不在 PATH 时失败（§3.1）。

### 6.3 建议的最小修复顺序

| 顺序 | 动作 | 文件 |
|---|---|---|
| 1 | 统一官方目录定位：优先平级、回落 `<ops>\Deepseek_DSH` 副本 | `update-dsh.ps1:8`、`check-update.ps1:6`、`sync-official.ps1:37` |
| 2 | 抽 `Resolve-NodePath` 并替换 4 处硬编码 | `start-dsh-web.ps1:127,183,242`、`update-dsh.ps1:284` |
| 3 | bootstrap 模板补 `extraDependencies`（运行时派生，不写死盘符）与可解析到的 `pythonPath` | `bootstrap-personal.ps1:80-87` |
| 4 | 给 4 个 `.ps1` 补 UTF-8 BOM | `bootstrap-personal.ps1`、`start-dsh-web.ps1`、`update-dsh.ps1`、`watchdog-dsh.ps1` |
| 5 | bat 入口复用 `health-check.cmd` 的 pwsh 定位块 | `启动DSH.bat:8,11`、`更新DSH.bat:7` |
| 6 | 端口/DSH_HOME 解析统一（`update-dsh.ps1` 5 处、`health-check.py:35`） | 见 §3.2、§3.5 |

> 修完 1–2 后应重跑一遍「新机演练」验证；`validate-plugins.mjs` / `test-standard.mjs` 只覆盖插件层，覆盖不到本次发现的启动链与升级链问题（`test-standard.mjs` 是这批工具里可移植性最好的样本：`process.execPath` + `mkdtemp(tmpdir())`，可作为改造范式）。

---

## 7. 审核边界与未做事项

- 本次**未修改任何被审文件**，未启动/停止任何服务，未触碰 `C:\Users\Administrator\.dsh` 的写操作（仅只读导出 `profiles\web\package.json` 作为基准）。
- 未执行 `update-dsh.ps1`、`pnpm install`、`pnpm build`、`git` 写操作。
- 「computer-use 缺依赖是否只 warn 不阻断」是从 `Deepseek_DSH/packages/boot/app-boot/src/index.ts:691-699, 781, 875-883` 的**源码**推出的；建议由 C 队（task-3）在隔离环境跑一次真实启动做最终实证。
- `plugins\**\cordis.patch.yml` 不在任务必扫范围，但为判定 §3.3 已单独只读检查 `dsh-computer-use` 与 `dsh-tool-python` 两个 patch 文件。
