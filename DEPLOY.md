# 新电脑部署指南（DEPLOY.md）

在另一台电脑上，按本文档从零部署**与开发机一致的一套个人 DSH**（官方源码 + 个人补丁 + 自研插件 + 个人配置）。

> **⚠️ 交付前提：先把仓库推到最新**
> 新机 `git clone` 拿到的只是 **GitHub 上的已提交内容**。本机工作区里任何未提交/未推送的改动
> 新机都看不到——表现就是「插件少几个」「补丁集是旧的」「某个修复没生效」。
> 部署前先跑文末「附：交付前检查」并提交推送。

---

## 架构速览

```
<root>\                                   ← 根目录，盘符与目录名任意（下文以 F:\QiTa 为例）
├── DSH-ops\                              个人部署仓库（git → github.com/liaojiawei0428/dsh-ops）
│   ├── Deepseek_DSH\                     官方源码副本 = 服务运行源（独立 node_modules + 本地补丁）
│   │                                     .gitignore 排除，不入个人 git；由 bootstrap 克隆
│   ├── plugins\                          自研插件（12 个目录，其中 11 个挂载；dsh-opencode-session-id 已弃用不挂载）
│   ├── personal-hub\                     个人层清单：personal.json（机器无关，入 git）
│   │                                     + personal.local.json（机器特定，gitignore，每台自建）
│   ├── official-patches\                 官方补丁（apply-patches.mjs：精确文本替换，异常即 fail-loud）
│   ├── bootstrap-personal.ps1            一键部署（本指南核心）
│   ├── reapply-cli.mjs                   按清单重建 web profile 的命令行入口
│   ├── sync-official.ps1                 官方 → 副本增量同步 + 打补丁 + 构建
│   ├── start-dsh-web.ps1                 服务启动（插件闸门 + 启动兜底 + 拉起看门狗 + 开一次浏览器）
│   ├── watchdog-dsh.ps1                  运行期看门狗 G5（由启动器成功路径拉起）
│   ├── update-dsh.ps1                    官方升级链（拉官方 → 同步副本 → 补丁 → 预检 → 重启）
│   ├── health-check.cmd/.ps1/.py         一键体检（服务/看门狗/日志/闸门/中文文案）
│   └── 更新DSH.bat / 启动DSH.bat          用户入口（双击）
└── Deepseek_DSH\                         平级官方 checkout = 升级链的拉取源（bootstrap 第 1b 步自动克隆）
```

**为什么有两个 `Deepseek_DSH`**：`DSH-ops\Deepseek_DSH` 是**运行副本**（带个人补丁，服务从这里启动）；
根目录下的 `Deepseek_DSH` 是**纯净官方 checkout**，只当「拉官方新版本」的源。
`update-dsh.ps1` / `sync-official.ps1` / `check-update.ps1` 都按
「**DSH-ops 的父目录** `\Deepseek_DSH`」定位它。**两份缺一不可**——少平级那份，升级链直接失败
（bootstrap 会自动创建；手工部署时别漏）。

---

## 第 0 步：环境准备（新机手工，一次性）

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Git | 任意现代版 | `git --version` |
| Node.js | **^22.19 或 >=24** | `node -v`；npm 自带。非默认安装位置（nvm/fnm/volta/scoop）也可，脚本走定位链 |
| pnpm | 11+（官方 lockfile 用 pnpm 11） | `corepack enable` 或 `npm i -g pnpm@11` |
| PowerShell 7 | 7.x | `pwsh -v`；Windows 自带 5.1，**必须装 7**；非默认安装位置可用 `DSH_PWSH_PATH` 指定 |
| **Python 3** | 3.12+（python.org 安装，勾选 py launcher；**勿用 Microsoft Store 版**） | `py -3 -V` 可用即可。`health-check`（体检第 1 条）与 `dsh-tool-python`（python 工具）都依赖它；没有则新机验收必红 |
| VS Build Tools（C++ 工作负载） | 最新 | `vswhere` 探测；**仅当官方更新引入原生依赖（如 fs-ext）时需要** |
| 网络 | GitHub 可达 | 本机通常需代理/VPN（`lib-proxy.ps1` 在**升级链**里自动诊断：代理或 TUN 任一即可；bootstrap 不做诊断，克隆失败请先确认代理） |

安装完成后重启终端。以下命令中的 `<root>` 可为任意目录（盘符自由），例如 `F:\QiTa`。

> ⚠️ **演练/隔离部署必读**：设置环境变量 `DSH_HOME=<隔离目录>`（如 `F:\QiTa\ceshi\.dsh-home`），
> 让 profile 装配到隔离目录而不是 `~/.dsh`。新机正式部署**不设** DSH_HOME（默认 `~/.dsh`）。
> 部署链与体检链**都读 `DSH_HOME`**（2026-09-19 起统一：`bootstrap-personal.ps1`、`update-dsh.ps1`、
> `watchdog-dsh.ps1`、`health-check.py`、`reapply-cli.mjs` 经由 `dsh-personal-hub`、`validate-plugins.mjs`、
> `disable-plugin.mjs`、`check-plugin-copy.mjs`），所以隔离演练**不必回避任何脚本**；
> `start-dsh-web.ps1` 自己不拼用户目录，`DSH_HOME` 由它启动的子进程直接继承。
> 唯一约束仍是「3080 端口只有一个」（见第 4 步端口冲突说明）。

---

## 第 1 步：拉取个人仓库

```powershell
cd F:\QiTa
git clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops
cd DSH-ops
```

> 目录名建议就叫 `DSH-ops`（与文档、脚本注释一致）；叫别的名字也能跑，只是下文路径要跟着改。
>
> 隔离演练时：
> ```powershell
> $env:DSH_HOME = 'F:\QiTa\DSH-ops\.dsh-home'   # 只对当前会话生效
> ```

---

## 第 2 步：一键部署（bootstrap-personal.ps1）

```powershell
pwsh -File .\bootstrap-personal.ps1
```

脚本按顺序完成（每步有进度输出，任一步失败即中止并说明原因）：

1. **克隆官方源码** → `.\Deepseek_DSH\`（`git clone --depth 1`；需要网络可达 GitHub）
1b. **克隆平级官方 checkout** → `..\Deepseek_DSH\`（升级链的拉取源，见「架构速览」）
   > 两处克隆都按**入库的版本锚点**（`official-patches\official-ref.txt`）取官方源码，
   > **新机无需任何设置**即与开发机一致；要临时换版本见「[版本锚定](#版本锚定dsh_official_ref)」。
2. **pnpm install** → 副本依赖（首次约 3-4 分钟）
3. **应用官方补丁** → `official-patches\apply-patches.mjs`（当前 **24 条精确文本替换 + 7 个文件恢复**；
   目标文本唯一性校验，异常即 fail-loud）
4. **pnpm run build** → 副本构建（产物带补丁；首次数分钟）
5. **profile 装配** → `reapply-cli.mjs` 按个人层清单重建 `%DSH_HOME%\profiles\web`：
   - dependencies（13 条 link：11 个自研插件 + 2 条官方 computer-use 包 → 指向本机副本，**盘符自由**）
   - bundles（**15 条** = 官方基座 2 + 自研 11 + 官方实验层 Agent Teams 2）
   - `cordis.patch.yml` 托管条目（`pwsh-sandbox` 的 pwshPath 覆盖；探测成功时还有 `tool-python` 的 pythonPath 覆盖）
   - 自动 `pnpm install` + 复检无漂移

> 可选项：
> - `-SkipInstall`：跳过依赖安装（已在副本预装时）
> - `-SkipProfile`：跳过 profile 装配（只做代码+构建）
> - 若 `personal-hub\personal.local.json` 不存在，脚本会**自动生成**（含本机 pwshPath、探测到的
>   pythonPath、以及 2 条指向本机副本的 computer-use link 依赖）——这三个值是机器特定的，
>   已经生成过就不要手改，除非换机器/换路径

**期望输出**（最后几行）：

```
1b/5 平级官方 checkout 已存在, 跳过 clone (...)   ← 或「已克隆」
5/5 装配 web profile（reapply-cli 按清单重建）...
  DSH_HOME = ...（默认 %USERPROFILE%\.dsh）
  已生成覆盖层 .../personal.local.json   ← 或「覆盖层已存在」
    pwshPath          = ...
    pythonPath        = ...
    extraDependencies = 2 条官方包 link（指向本机副本 packages, 盘符自由）
  { "ok": true, "actions": [ ..., "复检无漂移" ] }
==== 部署完成 ====
```

---

## 第 3 步：用户数据（`%DSH_HOME%` 或 `~/.dsh`）

bootstrap 已重建 `profiles\web\`。还需要**用户数据**（含密钥，不入仓库）：

| # | 文件/目录 | 内容 | 新机怎么来 |
|---|---|---|---|
| 1 | `settings.yaml` | 界面/模型/权限等设置 | **推荐直接从旧机复制**（不含密钥）；仓库 `config\settings.yaml` 只是最小骨架（139 行 / 7 个顶层段），**缺**开发机的 `shell`（pwsh 超时）、`subagent-model-selection`（子代理授权模型清单）、`llm-deepseek`（模型目录覆盖）三个命名空间，也不含开发机的模型 provider 通道、超时等配置——照它配出来的**不是**同一套 DSH |
| 2 | `.credentials.yaml` | API Key 等密钥 | 从旧机复制，或按格式重填；**永不提交仓库** |
| 3 | `AGENTS.md` | 全局指令底座（本机 AI 协作规则，对所有会话生效） | 从旧机复制 `~/.dsh/AGENTS.md`；或复制仓库 `config\AGENTS-global-template.md` 后按本机路径改写 |
| 4 | 插件自有凭据 | `github-push\credentials.json`（GitHub PAT）、`server-ssh\`（如启用 SSH） | 从旧机复制，或在新机重新登录/填写 |
| 5 | （可选）`backups\` | 历史备份 | 需要时从旧机复制 |

> 演练/验证时若只想「服务能起来」：`settings.yaml` 用仓库模板即可；`.credentials.yaml` 可暂缺
> （模型调用会报未配置，但服务本身能启动、插件能加载）。

---

## 第 4 步：启动与验证

```powershell
pwsh -File .\start-dsh-web.ps1
```

验证清单（全部通过才算部署成功）：

| # | 检查 | 命令/期望 |
|---|---|---|
| 1 | 健康检查 | `.\health-check.cmd`（或 `pwsh -NoProfile -File .\health-check.ps1`）→ 全绿；其中「看门狗 G5」段应显示在岗 pid（不在岗会自动复活） |
| 2 | 插件闸门 | `node .\validate-plugins.mjs` → **11 个挂载插件全 PASS**（退出码 0） |
| 3 | 中文文案 | `node .\check-plugin-copy.mjs` → `missing 0`（新增插件漏加中文名会在此报红） |
| 4 | 组合树 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` → 15 条 bundle 全部出现，含 `dsh-server-ssh / dsh-github-push / dsh-personal-hub / dsh-deepseek-balance / dsh-tool-python / dsh-computer-use / dsh-personal-bar` |
| 5 | 版本 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --version` → 与开发机一致（当前 `0.1.6-alpha.2`） |
| 6 | 页面 | 浏览器打开 `http://127.0.0.1:3080`（用 `dsh-web.log` 里带 token 的地址；裸地址 401）→ 个人胶囊行（SSH/推送/余额/版本）与 Agent Teams 均可用 |

> **端口冲突**：3080 是官方默认端口，且 `start-dsh-web.ps1` / `watchdog-dsh.ps1` / `update-dsh.ps1`
> 全链按 3080 判断存活——要换端口必须同步改这几处，否则看门狗会把健康服务误判为死亡并反复拉起。
> 演练时最省事的做法是先停本机正在运行的那个实例，或直接换一台机器练。

---

## 日常维护（与开发机一致）

| 操作 | 命令 |
|---|---|
| 升级官方 + 同步副本 | 双击 `更新DSH.bat`（update-dsh.ps1：拉官方 → 构建 → sync 副本 → 补丁 → 副本构建 → 预检 → 重启） |
| 仅同步官方到副本 | `pwsh -File .\sync-official.ps1` |
| 重新应用补丁 | `node .\official-patches\apply-patches.mjs .\Deepseek_DSH\packages` **⚠️ 只应对纯净官方副本重跑**：其中 8 个 append 型补丁**不幂等**，在已打过补丁的副本上重跑会重复插入（脚本仍报「全部补丁应用成功」）。正规做法是走 `pwsh -File .\sync-official.ps1`（先同步官方源码再打补丁） |
| 仅重建 profile | `node .\reapply-cli.mjs` |
| 改配置后推送 | push 插件（绑定 `dsh-ops`），或 `git push` |

> 平级官方 checkout 若被删掉，`更新DSH.bat` / `sync-official.ps1` 会**自动重新克隆**它
> （需要网络可达 GitHub）；也可以手工 `git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git <DSH-ops 的父目录>\Deepseek_DSH`。

---

## 版本锚定（`DSH_OFFICIAL_REF`）

补丁是**针对官方源码具体文本**的精确替换（fail-loud），所以「同一套 DSH」= 同一份官方源码 +
同一份补丁。官方默认分支一动，新机克隆到的就是另一份源码，补丁可能失配或行为漂移。

**新机不需要设任何环境变量**：锚点声明在仓库里（`official-patches/official-ref.txt`），
四条自动克隆点都按下面的顺序取值，取到就作为 `git clone --depth 1 --branch <值>` 的锚点：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 环境变量 `DSH_OFFICIAL_REF` | 临时指定/覆盖，优先级最高 |
| 2 | `official-patches\official-ref.txt` 首个非注释行 | **入库的声明值 = 新机默认锚点** |
| 3 | （都没有） | 不追加 `--branch`，克隆远端默认分支（旧行为） |

| 脚本 | 作用点 |
|---|---|
| `bootstrap-personal.ps1` | 第 1 步（`.\Deepseek_DSH\`）与 1b（`..\Deepseek_DSH\`）两处克隆 |
| `sync-official.ps1` | 平级 checkout 缺失时的自动补克隆 |
| `update-dsh.ps1` | 平级 checkout 缺失时的自动补克隆 |

```powershell
# 默认：直接用 official-ref.txt 的声明值，无需任何设置
pwsh -File .\bootstrap-personal.ps1
# 需要临时换版本时（只对当前会话生效）
$env:DSH_OFFICIAL_REF = 'dsh-v0.1.6-alpha.2'
```

- **只能填 tag 或分支名，不能填裸 commit SHA**——`git clone --branch` 不接受未指向 ref 的 SHA。
  官方仓库默认分支是 `master`，发版以 tag 形式打在上面（`dsh-v<版本>`）。
- **开发机当前锚定值 = `dsh-v0.1.6-alpha.2`**（平级官方 checkout `..\Deepseek_DSH\` 在 `master`、
  工作区干净、`git describe --tags --exact-match` 即该 tag；且该提交**同时就是** `origin/master`
  当下的尖端，所以此刻钉 tag 与钉分支等价）。升级官方后落到新 tag 时，请同步改 `official-ref.txt`。
- **锚点只在克隆时生效**：升级链后续仍跟进远端默认分支，所以锚点管的是「新机首装拿到哪一份」，
  不是「永远锁死」。
- 副本 `.\Deepseek_DSH\` 由 `sync-official.ps1` 用 robocopy 从平级 checkout 同步（`/XD .git`，
  所以副本**不保留** git 元数据）——它是**产物**，不是仓库；锚定只需管住平级 checkout 那一份。

### 钉 tag 的克隆是「游离 HEAD」——升级链已适配

`git clone --branch <tag>` 会把工作区 checkout 到该 tag，即 **detached HEAD**（游离 HEAD），
而且 `--single-branch` 隐含的 refspec **只取那个 tag**：`origin/master` 根本不存在。

这两点都会打断升级链，本仓库已针对性处理（2026-09-19 部署审核）：

| 环节 | 处理 |
|---|---|
| 克隆后 | `Initialize-PinnedClone`（`lib-official-ref.ps1`）把 refspec 修正成标准分支映射，使后续 `git fetch origin` 能创建 `origin/master`（幂等，普通克隆调用无副作用） |
| 升级时 | `update-dsh.ps1` 检测到游离 HEAD 时**不用** `git pull --ff-only`（在浅克隆边界下它必然报 `Not possible to fast-forward`，实测会死锁），改用 `git checkout --detach origin/master` 整体切到远端尖端 |
| 老副本 | 若某个 checkout 的 refspec 还是「只取 tag」的旧形态，升级链会**就地修正 + 重新 fetch** 后继续，不需要手工干预 |

实测（三种克隆形态各跑一遍升级，含上游删除文件的场景）：游离 HEAD + 已修正 refspec、
游离 HEAD + 旧 refspec（走兜底）、普通分支克隆（走原 `pull --ff-only`）**全部通过**，
工作树与提交完全一致、无残留脏文件；且仓库始终保持 shallow——**不需要**为升级下载
约 287 MB 的全量历史。

---

## 已知差异 / 边界

- **必须先提交推送**：新机只认 GitHub 上的已提交内容，工作区改动不算数（见「附：交付前检查」）。
- **补丁随官方升级失效**：官方若合入相同修复或改动同一处，`apply-patches.mjs` 会因目标文本不唯一而
  fail-loud——属预期，需人工核对后更新补丁文件。
- **机器特定值集中在 `personal-hub\personal.local.json`**（gitignore，每台自建）：`pwshPath`、
  `pythonPath`、以及 2 条 `extraDependencies`（`@deepseek-ai/dsh-computer-use`、
  `...-cua-driver-native` 的 `link:<本机副本>/packages/...`）。**缺 extraDependencies 会让
  `dsh-computer-use` 的 patch 行解析失败**（启动期 `failed to import`，插件被兜底摘掉）。
  这些值 bootstrap 会自动生成。
- **凭据/密钥不入仓库**：`settings.yaml`、`.credentials.yaml`、`personal.local.json`、
  `github-push\credentials.json` 均为本机文件；新机必须手工提供。
- **模型 provider**：settings.yaml 里的 provider 通道是本机特有的，新机按需要调整。
- **隔离演练**：`DSH_HOME` 被部署链与体检链**全部尊重**——`bootstrap-personal.ps1`、`update-dsh.ps1`、
  `watchdog-dsh.ps1`、`health-check.py`、`reapply-cli.mjs`（经 `dsh-personal-hub`）、`validate-plugins.mjs`、
  `disable-plugin.mjs`、`check-plugin-copy.mjs`；`start-dsh-web.ps1` 自己不拼用户目录，
  `DSH_HOME` 由子进程继承。**唯一约束是 3080 端口只有一个**（见第 4 步）。
- **无开机自启**：看门狗只在 `start-dsh-web.ps1` 成功路径被拉起，本机没有计划任务/注册表 Run 项/
  Windows 服务。重启电脑后要手动跑一次 `启动DSH.bat`（或自己加一个登录自启项）。
- **定位链**：node / pwsh / python 都按「环境变量覆盖 → PATH → 常见安装位」解析
  （`DSH_NODE_PATH` / `DSH_PWSH_PATH` / `DSH_PYTHON_PATH` 可显式指定）。裸 `python` 若解析到
  Microsoft Store 桩会被探测逻辑拒绝——请装 python.org 版本。
  **三个用户入口同样走定位链**：`启动DSH.bat` / `更新DSH.bat` / `health-check.cmd` 都按
  「`DSH_PWSH_PATH` → `where pwsh` → `%ProgramFiles%\PowerShell\7` → `%LocalAppData%\Microsoft\WindowsApps`」
  找 pwsh，**不含任何本机特定路径**；找不到时报错并提示装 pwsh 7 或设 `DSH_PWSH_PATH`。
  ⚠️ 这三个 `.bat`/`.cmd` **必须保持纯 ASCII**：cmd.exe 按 OEM 代码页解码，中文注释会变成乱码并被当作命令执行。
- **`cordis.patch.yml` 里的非托管条目**：官方 Agent Teams 会自行写入 `tool-agent-team` 这类条目；
  reapply **逐字保留**非托管条目但**不生成**它们（也不计为漂移，只在设置页 notes 里提示）。
  新机通常由官方组件在首次运行时补写；若对比发现缺失，照开发机的
  `~/.dsh/profiles/web/cordis.patch.yml` 手工补齐即可（低影响，不影响 Agent Teams 本身在
  `dsh.profile.bundles` 里的两条 bundle）。
- **Node 版本**：官方要求 `^22.19 || >=24`；pnpm 11+。
- **原生依赖**：官方 lockfile 若含 fs-ext 等原生模块，新机需 VS Build Tools（C++）——缺则
  `pnpm install` 报错，按提示安装。

---

## 附：交付前检查（部署前必做）

在**开发机**上执行，确认「新机能 clone 到什么」：

```powershell
cd <开发机>\DSH-ops
git status --porcelain                 # 期望：空（非空 = 新机拿不到这些改动）
git log origin/main..HEAD --oneline    # 期望：空（非空 = 有提交没推上去）
```

两行都不为空时，**必须先提交并推送**，否则新机部署出来的不是这一套 DSH。提交前请人工审阅，
至少要确保下列关键件都在版本库里（**顺序敏感：`official-patches/notes/` 必须先于
`apply-patches.mjs` 提交**——后者的 restore 段以 notes 为唯一真相源，缺它会直接 exit 1）：

- `personal-hub/personal.json`（清单：plugins / extraBundles / extraPatches）
- `official-patches/notes/`（**先**）→ `official-patches/apply-patches.mjs`（**后**）
- `official-patches/official-ref.txt`（官方源码版本锚点声明值——缺它新机就退回「克隆远端默认分支」）
- `plugins/dsh-computer-use/`、`plugins/dsh-personal-bar/`（两个插件整目录）
- `plugins/dsh-personal-hub/index.js` 与 `client.js`、`plugins/*/package.json`、
  `plugins/dsh-plugin-guide/client.js`、`plugins/dsh-deepseek-balance/`（补丁效果的配套消费者）
- `start-dsh-web.ps1`、`bootstrap-personal.ps1`、`update-dsh.ps1`、`sync-official.ps1`、
  `check-update.ps1`、`watchdog-dsh.ps1`、`lib-official-ref.ps1`、`lib-proxy.ps1`（部署链；
  **两个 `lib-*.ps1` 是 dot-source 依赖，漏了脚本会直接报错**）
- `health-check.py`、`health-check.ps1`、`health-check.cmd`、`validate-plugins.mjs`、
  `check-plugin-copy.mjs`、`test-standard.mjs`（闸门与体检）
- `启动DSH.bat`、`更新DSH.bat`（用户入口——曾经不在远端，导致文档指向的命令不存在）
- `config/settings.yaml`、`config/AGENTS-global-template.md`（模板）
- `.gitignore`、`DEPLOY.md`、`ARCHITECTURE.md`（本指南本身）

**不要**提交：`*.log`、`dsh-web.pid`、`backups/`、`node_modules/`、`personal-hub/personal.local.json`、
`Deepseek_DSH/`（副本）、`__pycache__/`（已在 `.gitignore` 中排除）。
> 注意：`__pycache__/health-check.cpython-*.pyc` 曾被提交入库，`.gitignore` 只对**未跟踪**文件生效
> ——需要 `git rm --cached __pycache__/health-check.cpython-*.pyc` 才能真正从仓库里移除。
