# D-对抗验证与漏报排查（crosscheck.md）

> 审核员：teammate `crosscheck`（红队 / 对抗验证员）
> 任务：`task-4`（标题「D-对抗验证与漏报排查：核对 A/B/C 结论并给最终 BLOCKER 清单」）
> 审核对象：`DEPLOY.md` 的声称「在另一台电脑照它就能部署出与开发机完全相同的 DSH」
> 取证时间：2026-09-19 15:2x（本机时区 +0800）
> 方法纪律：全程只读（git 只读命令、文件只读、`node validate-plugins.mjs` 只读闸门）；未重启服务、未改 `~/.dsh`、未 commit/push/checkout、未跑 `update-dsh.ps1` / `pnpm install` / `build`
> 唯一写入：本文件

---

## 0. 一句话结论（先说最重要的）

**「新机照 DEPLOY.md 就能得到与开发机完全相同的 DSH」在事实上不成立**，而且原因不在文档措辞，在**仓库状态本身**。

**先纠正一个连任务描述都搞错的基线（本审核最重要的单点发现）**：

> 任务描述与 Lead 简报都把「新机 clone 到的是已提交内容」等同于「HEAD 的内容」。**这是错的。** `git status -sb` 显示 `## main...origin/main [ahead 2]` —— 本地有 2 个 commit **从未推送**。新机从 GitHub clone 拿到的是 **`origin/main` = `1adc2535cd`，`2026-09-09 16:44:56 +0800`**，即
> - 比本地 HEAD（`05e2dda0`，09-17 10:30）**还早 8 天**、
> - 比开发机工作区实际状态（09-19）**早 10 天**、
> - 文件数 **292**（HEAD 是 **338**，工作区更多），**少 46 个文件**。
>
> 实测：`git ls-tree -r --name-only origin/main | Measure-Object` → 292；`origin/main..HEAD` → 2 个 commit。
> （远端真实状态无法验证：`git ls-remote origin main` 21 秒超时 `Could not connect to github.com port 443`，与 `lib-proxy.ps1:57-60` 描述的现象一致。故「远端 = 本地记录的 `origin/main`」这一前提成立的条件是**没有第三处推送**。）

于是真实图景是：**新机拿到的是一个 09-09 的、内部自洽的旧快照**——10 个插件 ↔ 文档说「10 个」、2 个补丁 ↔ 文档说「2 个补丁」、含 `dsh-opencode-session-id` ↔ 文档把它列为自研插件之一。**它错的地方不是「自相矛盾」，而是「比开发机落后 10 天的演进」**：决定部署产物的关键文件绝大部分还躺在工作区未提交（24 个已修改文件 + 2 个**整目录未跟踪插件**），另有 2 个 commit 卡在本地未推送。

**因此本审核最终把问题重新定位为：不是「文档写错了」，而是「开发机的成果没有进入发布通道」（dual-track「用户审阅后自行提交」流程的执行缺口）。** 详见 §3 分档。

**但必须纠正一个流行的直觉**：新机跑 `bootstrap-personal.ps1` **不会失败**——它会**成功地装配出一个与开发机不同的 DSH**。这两件事的严重度排序不同，修复动作也完全不同，下文分开处理（见 §3 分档）。

---

## 1. 取证基线与关键事实（全部一手）

### 1.1 仓库状态

| 事实 | 证据 |
|---|---|
| HEAD = `05e2dda00dd695014ed1f30c2518395c71bc22bd`，`2026-09-17 10:30:45 +0800`，`chore: DSH sync` | `git log -n 3 --stat` |
| 分支领先远端 2 个 commit，**未推送** | `git status -sb` → `## main...origin/main [ahead 2]` |
| 已修改未提交 24 个文件（+561/−97） | `git diff --stat` |
| 未跟踪 2 个完整插件目录 + 6 项文件/目录 | `git status --porcelain` 的 `??` |
| 已跟踪文件总数 338 | `git ls-files \| Measure-Object` |

**「ahead 2」的两个 commit 是否属于部署链关键修复？——判定：不属于。**

`git log origin/main..HEAD --oneline --stat`：

- `05e2dda00d`：8 个文件，全部是 `buglog/*.md`、`buglog/INDEX.md`、`version-history.md`、`personal-hub/personal.json`(+5/−)、`plugins/dsh-personal-hub/index.js`(+55/−...)。其中 `personal.json` 与 `index.js` 确属部署链，但改动很小（见 §2 分析）——**这两个 commit 推上去只改变「新机拿到 10 插件清单 + 55 行 reapply 细节」，不改变下述任何一条结论**。
- `25a72b8ba3`：54 个文件、+2647/−942，含 `health-check.cmd/ps1/py`、`lib-proxy.ps1`、`sync-official.ps1`、`official-patches/prune-copy.mjs`、`plugins/dsh-deepseek-balance/index.js` 等。**这一个 commit 是部署链关键修复**（health-check 首次入库、prune-copy 首次入库、sync-official 改动 30 行）。
- **结论：即使把 `ahead 2` 推上去，也仍然缺 §1.2 的全部未提交改动。**「未推送」不是主要风险，「未提交」才是。

### 1.1b 新机真实基线：`origin/main` 里到底有什么（292 文件）

`origin/main` 相对 HEAD **少的 46 个文件**（= 新机**不会有**的东西），全部实测列出：

| 类别 | 新机缺失的文件 | 后果 |
|---|---|---|
| **健康检查包装器** | **`health-check.cmd`、`health-check.ps1`** | 见 A0：新机只能按文档跑**裸 `python`** |
| **用户入口** | **`启动DSH.bat`、`更新DSH.bat`** | **文档 L18、L132 指向的文件在新机不存在**（断链） |
| 同步工具 | `official-patches/prune-copy.mjs` | origin/main 版 `sync-official.ps1` 也确实不调用它（自洽，非缺陷） |
| 排查/验证脚本 | `probe-*.mjs`(5)、`verify-*.mjs`(3)、`fix-*.cjs`(3)、`patch-*.cjs`(2)、`add-*.cjs`(2)、`finalize-opencode-routes.cjs` | 开发工具，非部署必需 |
| buglog | 33 个 `buglog/2026-09-09..09-17-*.md` + `INDEX.md` 增量 | 知识库落后 10 天 |

`origin/main` 中**存在**的部署链关键文件（逐项实测）：`DEPLOY.md`、`bootstrap-personal.ps1`、`reapply-cli.mjs`、`start-dsh-web.ps1`、`update-dsh.ps1`、`sync-official.ps1`、`check-update.ps1`、`watchdog-dsh.ps1`、`health-check.py`、`lib-proxy.ps1`、`.g5-observer.ps1`、`validate-plugins.mjs`、`disable-plugin.mjs`、`new-plugin.mjs`、`test-standard.mjs`、`AGENTS.md`、`PLUGIN-STANDARD.md`、`ARCHITECTURE.md`、`personal-hub/personal.json`、`config/settings.yaml`、`config/AGENTS-global-template.md`、`official-patches/apply-patches.mjs` + 2 个 `.patch`。

`origin/main` 中**不存在**的：`check-plugin-copy.mjs`、`plugin-display-names.md`、`PERSONAL-CAPSULES.md`（与 HEAD 一致）。

**唯一一处文档内部矛盾（新机自相矛盾的地方）**：`origin/main` 版 `DEPLOY.md` 与工作区/HEAD 版**逐行相同，只差 L117 一行**：

| 版本 | `DEPLOY.md` L117（验证清单第 1 项） |
|---|---|
| `origin/main`（**新机读到的**） | `\| 1 \| 健康检查 \| \`python .\health-check.py\` → 全绿 \|` |
| HEAD / 工作区（**队友审核的**） | `\| 1 \| 健康检查 \| \`.\health-check.cmd\`（或 \`pwsh -NoProfile -File .\health-check.ps1\`）→ 全绿 \|` |

> ⚠️ **给 task-1/2/3 的方法论警告**：三位队友都在审**工作区/HEAD 版 DEPLOY.md**，而**新机读到的是 `origin/main` 版**。两版 145/146 行相同，但**恰好在「健康检查」这一行不同**——这是唯一一处「文档内容随仓库版本变化」的地方，也正是新机会踩的那一步（A0）。凡结论涉及「文档怎么写的」，都必须声明所依据的版本，否则对新机不适用。

### 1.2 未提交清单 —— 按「是否属于部署链关键文件」分类

任务点名的 6 类部署链关键文件，命中情况如下（`M` = 已修改未提交，`??` = 未跟踪）：

| 关键类别 | 状态 | 说明 |
|---|---|---|
| `DEPLOY.md` | ✅ 干净 | 与 HEAD 一致，**未修改**。即文档没有「本地已修好但没提交」的问题 |
| `bootstrap-personal.ps1` | ✅ 干净 | 与 HEAD 一致 |
| `start-dsh-web.ps1` | ❌ **M（+42/−...）** | 含 token 地址 + `--no-open` 修复，**新机拿不到**（详见 §2.7） |
| `official-patches/*` | ❌ **M + ??** | `apply-patches.mjs` **2024 B → 21678 B（2 补丁 → 17 补丁 + 7 项 notes 恢复）**；`?? official-patches/notes/`（**11 个文件、35 万字节**，是 restore 段的唯一真相源） |
| `personal-hub/*` | ❌ **M** | `personal.json`（+29/−...）；HEAD 版**连 `extraBundles` / `extraPatches` 字段都没有** |
| `plugins/*` | ❌ **M + 2 个整目录 ??** | `plugins/dsh-computer-use/`、`plugins/dsh-personal-bar/` **零跟踪文件**；另有 16 个 `plugins/**` 文件已修改未提交 |

完整「新机 clone 后会缺什么」清单（`git ls-files plugins/` 对磁盘 `plugins/` 的精确差集，已修正 git 对中文路径的转义）：

```
disk plugins   (12): dsh-bug-log, dsh-computer-use, dsh-deepseek-balance, dsh-github-push,
                     dsh-locale-language, dsh-opencode-session-id, dsh-personal-bar,
                     dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume,
                     dsh-server-ssh, dsh-tool-python
tracked plugins(10): 去掉 dsh-computer-use, dsh-personal-bar —— 其余 10 个全部已提交
IN DISK but NOT TRACKED : ['dsh-computer-use', 'dsh-personal-bar']
TRACKED but NOT IN DISK : []
```

其余未跟踪项：`check-plugin-copy.mjs`、`plugin-display-names.md`、`PERSONAL-CAPSULES.md`、`official-patches/notes/`、`.plugin-deps.json`、`.readme-patch-draft.json`、约 33 个 `buglog/2026-09-1*.md`。

> **纠错（防止队友误报）**：`启动DSH.bat` / `更新DSH.bat` **已被跟踪**。首次用 `git ls-files` 比对时二者显示为未跟踪，是因为 git 默认把非 ASCII 路径转义成 `"\345\220\257..."`；加 `-c core.quotepath=false` 后确认二者在跟踪清单内（`启动DSH.bat`、`更新DSH.bat` 是本仓库仅有的两个非 ASCII 路径）。**不要把 .bat 列入「缺件」。**

### 1.3 密钥 / 产物误入库检查（b 项）

`git ls-files` 全量 338 条中，按 `credential|personal\.local|\.log$|backups?/|\.env|secret|token` 搜索，**只命中 5 个 buglog 文件名**（如 `buglog/2026-08-18-dsh-3-dsh-web-stderr-log-credentials-yam.md`），**没有任何真实密钥、`.credentials.yaml`、`personal.local.json`、日志或 `backups/` 被提交**。

`.gitignore` 内容（全文）：

```
*.log / dsh-web.pid / backups/ / watchdog.heartbeat
node_modules/
personal-hub/personal.local.json
Deepseek_DSH/
```

**判定：密钥层面干净，`.gitignore` 的关键排除项（`personal.local.json`、`Deepseek_DSH/`、`backups/`、`*.log`）全部正确且有效。** 唯一污点是产物误入库：

- ❌ **`__pycache__/health-check.cpython-314.pyc` 被提交入库**。`.gitignore` **未忽略** `__pycache__/` 或 `*.pyc`。新机 clone 会拿到一个 python 3.14 的机器特定字节码（而仓库里 `.py` 只有 `health-check.py` 一个）。属产物污染，不阻断部署。

### 1.4 官方补丁与官方 HEAD 的耦合（f 项）

`bootstrap-personal.ps1:42`：

```powershell
git clone --depth 1 $OfficialUrl $copy     # 无 --branch、无 tag、无 commit 固定
```

`apply-patches.mjs` **没有任何版本上界/下界校验**（全文无 `package.json` 版本读取、无 `git rev-parse` 比对、无白名单 commit）；唯一防线是「目标文本必须恰好出现 1 次」（`apply-patches.mjs:180-183`）。

实测（用 python 解析工作区 `apply-patches.mjs` 的补丁数组，逐个在真实源码中数锚点出现次数）：

| 源码树 | 锚点唯一命中 (OK) | 锚点 0 次 (ZERO) | 歧义 (AMBIG) |
|---|---|---|---|
| **纯净官方克隆** `E:\DSH\Deepseek_DSH`（HEAD `ddefc45f`，2026-09-17 21:19，`0.1.6-alpha.2`，**非 shallow**） | **17 / 17** | 0 | 0 |
| 个人副本 `E:\DSH\DSH-ops\Deepseek_DSH`（已打补丁） | 6 / 17 | 11 | 0 |

两条读法：

1. **好消息**：补丁集与「开发机所用的官方版本」**完全对得上**（17/17），没有错位。
2. **坏消息**：这**不能**保证新机。新机 clone 的是**部署当天**的官方 `main` HEAD；开发机这棵官方克隆停在 `2026-09-17 21:19`，而审核当天是 `2026-09-19`——**已经有约 2 天的时间差，且没有任何机制阻止这个差值继续扩大**。一旦官方改动 17 处中的任意一处，`apply-patches.mjs` 会 `exit 1`（`:245-248`），`bootstrap-personal.ps1:60-62` 随即 `throw '补丁应用失败'`，**部署在第 3/5 步中止**。
3. **失败语义还不干净**：补丁循环是「逐个命中即 `writeFileSync`（`:185`）→ 全部循环完才检查 `failures`（`:245`）」，**不是原子的**。若第 9 个补丁失败，前 8 个已经落盘，副本处于**半打补丁**状态；重跑时前面的补丁会走「ZERO → fail」路径。**新机一旦踩中，现场是「部分应用的副本 + fail-loud」，而非「干净的未应用副本」。**

### 1.5 首次启动路径（d 项）

- **端口 3080 从哪来**：不是部署脚本写的。`config/settings.yaml` 模板与 `~/.dsh/settings.yaml` 里**都没有 `webServer` / `port` 字段**（对两个文件全文搜索 `port|webServer|token|openBrowser|printUrl` 无命中）→ 3080 是**官方 web-app 的默认端口**。`DEPLOY.md:124` 建议「改 `settings.yaml` 的 webServer port」这条指引**没有给字段名/schema，照抄改不出来**（属文档瑕疵）。
- **token 从哪来**：实测 `E:\DSH\DSH-ops\dsh-web.log` 内容**只有 1 行**：

  ```
  dsh web: http://127.0.0.1:3080/?token=<已打码>
  ```

  → `DEPLOY.md:122`「登录 token（`dsh-web.log`）」的说法**属实**，且与工作区 `start-dsh-web.ps1:28-37` 的 `Get-AuthenticatedUrl` 正则 `^dsh web: (http://\S+)$` **精确匹配**。
- **没有 `settings.yaml` / `.credentials.yaml` 能否起来**：**能**。凭据是按请求惰性解析的（`apiKeyEnv` 经 harness 凭据 seam 逐请求解析，解析为空 → 请求以 `MISSING_CREDENTIAL` 失败，而非启动失败）——该语义有一手来源：官方 `llm-pi-ai` README 原文，被本仓库 `official-patches/apply-patches.mjs:103` 逐字引用。`DEPLOY.md:103` 的说法**成立**。
  > 我**没有**实测（任务禁止启动服务）；此判定基于官方文档语义 + 凭据仅出现在请求路径。标注为**「成立（间接证据）」**。

### 1.6 看门狗 G5 的落地方式（e 项）

实测本机注册面：

| 注册方式 | 结果 |
|---|---|
| 计划任务 `Get-ScheduledTask`（匹配 `dsh\|watchdog\|DSH`） | **无任何匹配** |
| `HKCU\...\Run` + `HKLM\...\Run` | **无 dsh/watchdog 项**（只有 VPN、微信、Chrome 等） |
| Windows 服务 `Get-Service` | **无匹配** |
| 运行中进程 | ✅ 有 1 个：PID 37544 `"E:\GongJu\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File E:\DSH\DSH-ops\watchdog-dsh.ps1` |

拉起路径**只有一条**：`start-dsh-web.ps1:89-108` 的 `Ensure-Watchdog`（已跑就返回，否则 `Start-Process -WindowStyle Hidden` 拉起），且**仅在成功路径被调用**（`:161` 服务已在运行分支、`:210` 启动成功分支）。

**判定**：
- 新机**首次** `pwsh -File .\start-dsh-web.ps1` 成功后会拉起看门狗 ✅（这层不用文档也有）
- 但**机器重启后看门狗不会自启**——没有任何持久化注册，必须有人再跑一次 `start-dsh-web.ps1`（或按 `DEPLOY.md:117` 跑 `health-check.cmd`，其内部会「看门狗不在岗自动复活」）。
- `DEPLOY.md` **全文 146 行里「看门狗 / watchdog / G5 / 计划任务 / 开机自启」出现 0 次**（实测逐行匹配：只命中 `:122` 的 token/3080 与 `:124` 的端口冲突）。而 `config/AGENTS-global-template.md` 明确写着「看门狗 G5 常驻守护服务（30 秒心跳 + 黑匣子 + 自动复活）」——**文档之间存在认知落差**：模板当它是事实，DEPLOY.md 当它不存在。

### 1.7 ⚠️ 审核完整性事件：被审对象在审核期间被修改（15:25:55）

**必须记录在案**：本审核进行中，**6 个部署链脚本在 `2026-09-19 15:25:55` 被同一批次修改**（mtime 实测完全相同到秒）：

```
bootstrap-personal.ps1  8742 B  15:25:55   → git status: M  (+66/−6)
check-update.ps1        2916 B  15:25:55   → git status: M
start-dsh-web.ps1      14521 B  15:25:55   → git status: M
sync-official.ps1       4562 B  15:25:55   → git status: M
update-dsh.ps1         19800 B  15:25:55   → git status: M
watchdog-dsh.ps1       10927 B  15:25:55   → git status: M
```

已修改文件总数从审核开始时的 **24** 变为 **30**（新增的 6 个正是上表）。修改内容与三份产出的建议修法**逐条对应**：新增 `$officialRoot` 平级 clone（`bootstrap-personal.ps1:56`，对应 docs-B2 / scripts-BLOCKER-1）、覆盖层补 `extraDependencies` 两条 link（`:131-134`，对应 docs-B3 / scripts-INCONSISTENT-3）、覆盖层补 pythonPath 探测（`:96-121`，对应 docs-B1 / scripts-INCONSISTENT-4）、**并修掉了双重 `ConvertTo-Json`**（`:141-143`，注释直言「2026-09-19 部署审核 BUG」，对应 repro 缺陷 A）。

**这一事件对审核的三种影响**：

1. **行号失效（影响所有三份产出）**：`bootstrap-personal.ps1` 因新增 66 行，其第 5 步范围内的一切行号**整体后移约 16 行**。实测漂移对照：

   | 内容 | 三份产出引用的行号 | 当前实际行号 |
   |---|---|---|
   | `git clone --depth 1 $OfficialUrl $copy`（副本） | 40-43 / 42 | **42**（未漂移，在新增区之前） |
   | `node … apply-patches.mjs` | 60 | **76** |
   | `throw '补丁应用失败'` | 61-62 | **77** |
   | `node … reapply-cli.mjs` | 99 | **159** |
   | `throw 'reapply-cli 失败'` | 100 | **160** |
   | 收尾提示「恢复用户数据 ~/.dsh/settings.yaml…」 | 107 | **167** |
   | 收尾提示「插件闸门应 10/10 通过」 | 109 | **已删除**（全文不再有 `10/10`） |
   | `$pwshPath` fallback | 78-79 | **94-95** |

   → **凡引用 `bootstrap-personal.ps1` 行号的结论，读者都必须按上表换算**，否则会指到错误的代码。

2. **结论时效性**：三份产出对 `bootstrap-personal.ps1` 的批评（缺 pythonPath、缺 extraDependencies、双转换）**在它们成文时全部成立**，但**在工作区已不复存在**。然而——

3. **对新机而言结论丝毫未变（这是关键）**：所有修复都在**工作区**，`git ls-tree origin/main` 里**没有**它们。我逐条实测 `origin/main` 版：

   - `git show origin/main:bootstrap-personal.ps1 | grep officialRoot` → **无输出**（平级 clone 未修）
   - `git show origin/main:update-dsh.ps1 | grep 未找到仓库` → `Write-Both "错误: 未找到仓库 $repo"`（**仍在**）
   - `git show origin/main:bootstrap-personal.ps1 | grep ConvertTo-Json` → **连续两行双转换**（缺陷 A **仍在**）

   → **「新机部署一致性」的最终判定不受此次修改影响**，因为新机拿到的是 `origin/main`。**这反过来印证了 §0 的核心论点：问题在发布通道（未提交/未推送），不在代码。**

**给 lead 的三条硬要求（审核纪律）**：
- ① 这 6 个文件的修改**改变了被审对象**，因此**不能再以「审核期间的工作区」作为任何结论的证据快照**；所有最终结论必须以 `origin/main`（新机基线）或修改后的**新**工作区为准，并注明时点。
- ② 修改后的 6 个 `.ps1` 必须补 **UTF-8 BOM** 并做语法检查（`AGENTS.md` 准则 5），且**必须确认没有引入 `powershell.exe` 调用**——这是本次修改引入的**新**回归风险，需单独验证。
- ③ `watchdog-dsh.ps1` 被改而**看门狗进程（PID 37544）仍在运行旧代码**（`watchdog.heartbeat` 15:26:13 仍更新，说明进程活着）→ 新旧代码不一致的状态应显式记录，并在下次自然拉起后确认行为一致。

---

## 2. 逐条判定：新机照现仓库跑 bootstrap，到底会发生什么

这一节是对 §1 的组合推理，给 Lead 的 3 个问题直接答案。

### 2.1 新机装配会「失败」还是「成功但少东西」？→ **成功，但产物不同**（推翻「会失败」的直觉）

推理链（每一环都有证据）：

1. 新机 clone 得到 **HEAD 版** `personal-hub/personal.json`，其 `plugins[]` 恰为 10 项：
   `dsh-locale-language, dsh-deepseek-balance, dsh-tool-python, dsh-bug-log, dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume, dsh-server-ssh, dsh-github-push, dsh-opencode-session-id`
2. 这 10 个包名与**已提交的 10 个插件目录完全一一对应**（`set(HEAD plugins) - set(tracked dirs) = ∅`，实测输出 `HEAD-declared plugins missing from TRACKED dirs: []`）
3. 新机 clone 得到 **HEAD 版** `plugins/dsh-personal-hub/index.js`，其 reapply 是**整体替换**语义：
   ```js
   livePackage.dsh = { ...(livePackage.dsh ?? {}), profile: { ...,
     bundles: [...manifest.officialBundles, ...manifest.plugins.map(p => p.name)] } }
   ```
   （工作区版才改成「只补不删 + 保留清单外项」＋新增 `extraBundles`/`extraDependencies`/`removedBundles` 校验）
4. 因此 `expectedDeps` 的 10 条 `link:<repo>/plugins/<name>` 目标**全部存在** → `pnpm install` 的 link 解析不会失败 → `reapply-cli` 退出 0
5. `bootstrap-personal.ps1:99-100` 的 `throw 'reapply-cli 失败'` **不会触发**

**结论：新机 bootstrap 5 步全部走通，打印 `==== 部署完成 ====`。** 失败的只是「与开发机相同」这个断言。

### 2.2 装配结果差异（4 缺 1 多）—— 这是「部署一致性」的实证清单

对开发机真实 profile `C:\Users\Administrator\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles`（**实测 15 条**）与新机预期（**12 条**）做差：

| # | bundle | 开发机 | 新机（HEAD 装配） | 后果 |
|---|---|---|---|---|
| 1-2 | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` | ✅ | ✅ | — |
| 3 | `dsh-locale-language` | ✅ | ✅ | — |
| 4 | `dsh-deepseek-balance` | ✅ | ✅ | — |
| 5 | `dsh-tool-python` | ✅ | ✅ | — |
| 6 | `dsh-bug-log` | ✅ | ✅ | — |
| 7 | `dsh-personal-hub` | ✅ | ✅ | — |
| 8 | **`dsh-personal-bar`** | ✅ | ❌ **缺** | **作曲器下方个人胶囊行（SSH/推送/余额/DSH版本）整条不存在** |
| 9 | `dsh-plugin-guide` | ✅ | ✅ | — |
| 10 | `dsh-restart-resume` | ✅ | ✅ | — |
| 11 | `dsh-server-ssh` | ✅ | ✅ | — |
| 12 | `dsh-github-push` | ✅ | ✅ | — |
| 13 | **`dsh-computer-use`** | ✅ | ❌ **缺** | **computer-use 服务 + Cua Driver native provider 全部不存在**（本会话的 `cua_driver_native__*` 工具组在新机为 0） |
| 14 | **`@deepseek-ai/dsh-experimental-agent-team-profile`** | ✅ | ❌ **缺** | HEAD `personal.json` **没有 `extraBundles` 字段** |
| 15 | **`@deepseek-ai/dsh-experimental-agent-team-web-profile`** | ✅ | ❌ **缺** | 同上 |
| — | `dsh-opencode-session-id` | ❌ | ✅ **多** | 新机**多装**一个开发机已不用的插件 |

**净差 4 缺 1 多。** `DEPLOY.md:122` 第 6 项验证清单「**个人工具栏（SSH/推送/余额）可见**」在新机**必然失败**——它需要 `dsh-personal-bar`，而该目录零跟踪、HEAD 清单也没声明它。

### 2.3 补丁集差异 —— 比缺插件更致命

`git diff HEAD --stat` 显示 `official-patches/apply-patches.mjs | 197 +++++...`，实测文件大小 **2024 B（HEAD） → 21678 B（工作区）**。逐个读出：

| | `origin/main` 版 / HEAD 版 | 工作区版（未提交） |
|---|---|---|
| 补丁数 | **2**（实测 `origin/main` 版与 HEAD 版都是 2；两条 `file:` 分别指向 `client/connection/src/rpc-host.ts`、`session/session-format-v0-to-v1/src/payload-validation.ts`） | **17** |
| 内容 | ① connection rpc `owner.root.webServer` 崩溃修复 ② session descriptor v2→v3 兼容 | 上述 2 条 + 15 条 |
| notes 恢复 | **无** | **有**（7 项：`.agents/notes/...` 双语笔记 ×3、`llm-pi-ai/README.i18n.yaml`、`docs/config-catalog.md` + `.zh.md` + `.i18n.yaml`） |

> **措辞纠正（防止误判为「文档错误」）**：`DEPLOY.md:68` 写的「2 个补丁」与 `:118` 的「10 个 PASS」，对 **`origin/main` 快照而言是准确的**（新机拿到的确实是 2 补丁 + 10 插件）。所以这不是文档写错，而是**文档与代码同步停留在 09-09 的旧状态，而开发机已经走到 17 补丁 + 11 活跃插件**。把它报成「文档错误」会指向错误的修法（改文档），正确的修法是**把工作区改动提交上去**（§4 修 B2）。

新机（`origin/main`，2 补丁）**缺失的补丁效果**清单（按影响排序）：

1. ❌ `web/web-search-deepseek/src/provider.ts` 的 `x-opencode-session` 头 → **`web_search` 经 OpenCode Zen Go 网关会 HTTP 400 `MissingSessionID`**。而工作区 `personal.json` 的 `extraPatches` 正好声明了这条 `web-search-deepseek` 路由（HEAD 版**连 `extraPatches` 字段都没有**）。→ 新机的联网搜索能力**开箱即坏**。
2. ❌ `client/ui-conversation/src/client/skeleton/InputBar.module.css` 的 `.dock{flex-wrap:wrap}` → 即使补上 `dsh-personal-bar`，**胶囊行也无法独占一行**（会与官方 stats 胶囊挤在同一 nowrap 行）。这条是 `PERSONAL-CAPSULES.md` 记录的依赖链关键环。
3. ❌ `client/ui-plugin-manager/src/client/presentation.ts` 的两条补丁（`deploymentCopy()` 覆盖表 + `packageText` 读取）→ **插件管理页中文名/说明全部退回官方短名**（`plugins/dsh-plugin-guide/client.js` 发布到 `globalThis.__DSH_PLUGIN_COPY__` 的表无人读取）。工作区 `plugins/dsh-plugin-guide/client.js` 有 65 行改动，正是为此配套。
4. ❌ `llm/llm-pi-ai` 全套 9 条补丁（`config.ts` 字段+schema、`adapter.ts` ×3、`adapter.spec.ts` ×2、`README.md`/`README.zh.md` ×2）→ 新机 `llm-pi-ai` 路由**没有 `harnessSessionHeader` 能力**。这条与第 1 条是同一个 `MissingSessionID` 问题的官方侧解法（`.agents/notes/2026-09-17-harness-session-header-route-opt-in` 记录了该决策，而**这份决策笔记本身也在未提交的 `official-patches/notes/` 里**）。

> **注意**：`personal.json` 的 `extraPatches[0].comment` 明确写着「Requires the official-patches session-header patch, because this provider uses a private native fetch…」——**工作区清单已经假定了 17 补丁版的存在**。HEAD 清单（10 插件、无 extraPatches）与 HEAD 补丁脚本（2 补丁）是自洽的旧状态；工作区清单与工作区补丁脚本也是自洽的新状态。**危险在于任何「提交一半」的中间态**：例如提交了 `personal.json`（声明 `web-search-deepseek` 路由）而漏提交 `apply-patches.mjs`／`official-patches/notes/`，新机就会同时踩中 §2.3.1 与「restore 源缺失 → `apply-patches.mjs:236` push failure → exit 1」。

### 2.4 「自研插件 10 个」应改成的准确数字

三处口径不一致，实测数据如下：

| 口径 | 数字 | 证据 |
|---|---|---|
| `plugins/` 磁盘目录数 | **12** | 实测 `ls` |
| 已提交到本地 HEAD | **10** | `git ls-files plugins/`（已修正 quotepath） |
| **已推送到 `origin/main`（新机真实拿到）** | **10**，与 HEAD 完全相同 | `git ls-tree -r --name-only origin/main plugins/` → 逐名比对一致；`origin/main` 版 `personal.json` 的 `plugins[]` 也是同 10 个 |
| 开发机 profile 中**活跃**的自研插件 | **11** | `node validate-plugins.mjs` 末行：`validate-plugins: all 11 active linked plugin(s) safe to load` |
| 开发机 `dsh.profile.bundles` 中的自研插件 | **11** | 15 条 bundles − 2 官方基座 − 2 agent-team = 11 |
| `DEPLOY.md:10`「自研插件（10 个）」、`:118`「10 个 PASS」、`bootstrap-personal.ps1:109`「10/10 通过」 | 10 | — |
| 当前 `AGENTS.md`（工作区）「11 个自研插件的说明均为中文」 | 11 | — |

**准确表述应为：**磁盘 12 个插件目录 = **开发机活跃 11 个**（10 个已提交 + `dsh-personal-bar` + `dsh-computer-use`，减去开发机未安装的 `dsh-opencode-session-id`）＝**新机将装配 10 个**。

`dsh-opencode-session-id` 的定位（Lead 第 4 问）：**遗留 workaround**。它向 opencode.ai 网关请求注入 `x-opencode-session` 头以规避 `MissingSessionID`；工作区已于 `2026-09-17` 用官方侧 `harnessSessionHeader` 补丁取代它——**工作区 `personal.json` 已把该插件移出 `plugins[]`（HEAD 版第 45-52 行有、工作区版无），开发机 profile 里也确实没有它**。`plugins/dsh-opencode-session-id/package.json` 仍带 `M` 标记，属未清理的残留目录（保留合理，便于回退）。因此 `DEPLOY.md` 若把「10」改成「11」会**同时错两处**（新机是 10、开发机是 11），正确写法是分「新机将装配 / 开发机实际」两个数字，并注明校验命令 `node validate-plugins.mjs` 的末行输出才是权威。

### 2.5 首次启动的浏览器路径：新机拿到的是「两个 401 页面」

`start-dsh-web.ps1` 的 42 行未提交改动，正好修的是首次体验（`git diff HEAD`）：

| | HEAD 版（新机） | 工作区版（开发机） |
|---|---|---|
| dsh web 启动参数 | `'web'`（自带 `openBrowser` 默认 true） | `'web', '--no-open'`（`:184`） |
| 脚本开的 URL | `Start-Process 'http://127.0.0.1:3080'`（裸地址，两处） | `Get-AuthenticatedUrl`（`:28-37`）从 `dsh-web.log` 取**带 token** 地址（`:164`、`:218`） |

→ 新机：**两个来源各开一次浏览器**（官方 `openBrowser` + 脚本），且脚本那次是**裸地址**。而裸地址一定被认证拦下（工作区 `:22-24` 的注释与 `:211-217` 的注释都记录了这一点，实机 `dsh-web.log` 也确实只提供带 token 形式）。**结果：新机用户看到两个页面，其中至少一个停在认证失败页**，必须手工去 `dsh-web.log` 抄 token。

### 2.6 `~/.dsh` 用户数据的真实迁移面（DEPLOY.md 第 3 步严重不全）

开发机 `C:\Users\Administrator\.dsh` 实测条目：`.anonymous-user-id`、`.credentials.yaml`、`AGENTS.md`、`backups/`、`github-push/`、`profiles/`、`server-ssh/`、`sessions/`、`settings.yaml`、`storages/`。

`DEPLOY.md:92-103`（第 3 步）只列 **2 项**：`settings.yaml`、`.credentials.yaml`。`bootstrap-personal.ps1:107` 的收尾提示同样只有这 2 项。**未被文档提及但影响行为的**：

| 缺失项 | 影响 | 证据 |
|---|---|---|
| **`~/.dsh/AGENTS.md`** | 全局指令（D7 工具分工、服务纪律、子代理模型分派）**全部不存在** → 新机所有会话行为与开发机不同 | 系统提示明确「本文件由 DSH 指令加载器对**所有会话**注入」；开发机实测 3977 字节 |
| `~/.dsh/github-push/` | `dsh-github-push` 插件（bundles 第 12 条）**装了但无凭据** | 目录实测存在 |
| `~/.dsh/server-ssh/` | `dsh-server-ssh` 插件（bundles 第 11 条）**装了但无配置**；而本会话的 `ssh_*` 工具即来自它 | 目录实测存在 |
| `~/.dsh/.anonymous-user-id` | 匿名身份标识变化 | 实测存在（37 字节） |
| `~/.dsh/backups/` | `update-dsh.ps1:117-125` 的备份/恢复链依赖它（含密钥，永不入库，属正确设计） | 目录实测存在 |

**而且仓库里那个「全局指令模板」本身是残的**：`config/AGENTS-global-template.md`（1434 B）对比开发机 `~/.dsh/AGENTS.md`（3977 B）——模板**整章缺失「子代理模型分派（个人偏好，硬规则）」**：

```
子代理模型分派  template=0  live=1
agnes          template=0  live=4
强档            template=0  live=2
弱档            template=0  live=3
```

→ 即使新机用户聪明地找到了这个模板并照它部署，**仍然拿不到子代理强弱档分派规则**（而该规则在本机是硬规则）。`DEPLOY.md` 对该模板**零提及**。

### 2.7 `settings.yaml` 模板不可能「按本机修改」出开发机行为

| | `config/settings.yaml`（模板，3805 B） | `~/.dsh/settings.yaml`（实机，7325 B） |
|---|---|---|
| `agent-default-model` | `opencode-go` / `deepseek-v4-flash` | **`opencode-live` / `deepseek-v4.1-flash`** |
| `subagent-model-selection` | **无此段** | **有**（`agnes/agnes-3.0-flash` + `opencode-live/deepseek-v4.1-flash`） |
| 路由 | 少量 | 多路（`unlimitds.chat`、`api.b.ai`、`apihub.agnes-ai.cn`、opencode ×3…）+ `llm-deepseek` 段 |
| 字段量 | 约模板的 52% | 100% |

`DEPLOY.md:97`「按本机修改（模型 provider / 语言 / 代理等）」+ `:143`「模型 provider 是本机特有的模型通道；新机按需要调整」——**这是把「部署不一致」写成了「已知差异」**。可以接受，但必须与开头 `DEPLOY.md:3`「部署**与开发机完全相同**的一套个人 DSH」的强断言分开看：该断言在 settings 层**明确不成立**，且 `subagent-model-selection` 这段**不是「按需要调整」能补出来的**（它决定子代理分派策略，属于行为规则）。

---

## 3. 最终 BLOCKER 清单（去重，三档）

> 分档标准：**A 阻断部署** = 新机按文档走会中止或核心能力不可用；**B 导致结果不一致** = 能跑通，但产物/行为与开发机不同；**C 文档瑕疵** = 不影响运行，但文档失真。
> 编号 `X-*` 为本审核员独立发现（不在任务点名的 a–f 项内的另加项）。

### A 档 —— 阻断部署

| 编号 | 结论 | 证据 | 影响 |
|---|---|---|---|
| **A0** | **新机的健康检查入口是「裸 `python`」，而自动定位真实 python 的包装器在新机不存在；两个 `.bat` 用户入口也缺失（文档断链）** | ① `origin/main` 版 `DEPLOY.md:117` = `` `python .\health-check.py` → 全绿 ``；② `git ls-tree -r --name-only origin/main` 中**没有** `health-check.cmd`、`health-check.ps1`、`启动DSH.bat`、`更新DSH.bat`（四者均为 09-17 的 `25a72b8` 才入库）；③ 同版 `DEPLOY.md:18`（架构速览）与 `:132`（日常维护表「双击 更新DSH.bat」）**指向新机不存在的文件**；④ `~/.dsh/AGENTS.md` 与 `DSH-ops/AGENTS.md` 准则 9 均明确「命令行裸 `python` 会解析到 MS Store 桩」 | 新机**照文档做验证清单第 1 项就可能弹 Microsoft Store / 报错**；「双击 更新DSH.bat」找不到文件。这是新机部署完成后**第一个**撞上的问题，而三位队友审的工作区版 DEPLOY.md 已把这行改成 `.\health-check.cmd`，**因此这一条不会被他们中的任何人报出** |
| **A1** | **升级链在新机开箱即死**：`update-dsh.ps1` / `sync-official.ps1` 要求存在 `<个人仓库根>\Deepseek_DSH` 平级官方克隆，而 DEPLOY.md 从未让新机建立它 | `update-dsh.ps1:8` `$repo = Join-Path (Split-Path $ops -Parent) 'Deepseek_DSH'`；`:18-20` 若 `.git` 不存在 → `Write-Both "错误: 未找到仓库 $repo"` + `exit 1`。`sync-official.ps1:37` 同款派生（`origin/main` 版为 `:28`）、`:44` `throw "官方仓库缺失: $official"`。`bootstrap-personal.ps1:32,42` 只 clone **副本**（`$ops\Deepseek_DSH`）。DEPLOY.md 第 0/1 步无该克隆步骤，但 `:132-133` 承诺「双击 更新DSH.bat」「`pwsh -File .\sync-official.ps1`」可用 | 新机首次部署**成功**，但**任何**升级/同步动作立刻失败；用户会以为「部署坏了」 |
| **A2** | **补丁与「部署当天的官方 HEAD」时间耦合，且无任何版本上界校验；失败时副本处于半打补丁状态** | `bootstrap-personal.ps1:42` `git clone --depth 1`（无 branch/tag/commit 固定）；`apply-patches.mjs` 全文无版本校验；`:180-183` 唯一防线是「出现 1 次」；实测本机官方克隆 17/17 命中但停在 `2026-09-17 21:19`，审核日 `2026-09-19`（已差 ~2 天）；非原子：`:185` 逐个落盘、`:245-248` 才汇总 fail | 官方改动 17 处中任一处 → bootstrap 第 3/5 步 `throw '补丁应用失败'`，**部署中止**；若中途失败则留下半成品副本 |
| **A3** | **`C:\Program Files\nodejs\node.exe` 硬编码在启动链 4 处，node 无定位链**（而同一脚本里 pwsh 有完整定位链） | `start-dsh-web.ps1:127`（插件闸门）、`:183`（**启动服务本体**）、`:242`（隔离坏插件）；`update-dsh.ps1:284`。对照 `start-dsh-web.ps1:70-82` `Resolve-PwshPath`（`DSH_PWSH_PATH` → PATH → Program Files 回退）。DEPLOY.md 第 0 步只要求 `node -v`，未要求装在 Program Files | 新机用 nvm-windows / fnm / scoop / 自定义目录装 node（**极常见**）→ `Start-Process -FilePath` 找不到文件 → **服务起不来**；且报错指向 node 路径而非「请安装 node」 |

### B 档 —— 导致结果不一致

| 编号 | 结论 | 证据 | 影响 |
|---|---|---|---|
| **B0** | **`bootstrap-personal.ps1` 生成的机器覆盖层是一个「JSON 字符串字面量」→ 被 reapply 整层静默忽略**（本轮最隐蔽的一条；我已独立复现） | ① 源码：`origin/main` 版 bootstrap 对同一哈希表**连续调用两次** `ConvertTo-Json`（先 `\| ConvertTo-Json -Depth 5` 赋值，再 `WriteAllText(..., ($local \| ConvertTo-Json -Depth 5), ...)`）；② 我的独立实测：第二次转换的输出**以 `"` 开头**，`ConvertFrom-Json` 得 **`System.String`**（单次转换对照得 `PSCustomObject`）；③ 消费侧：`plugins/dsh-personal-hub/index.js:224` `JSON.parse(...)` 读到字符串，`:228` `typeof local === 'object'` 为 false → 跳过 `mergeOverlay`（`:229`）；④ 该 bootstrap 版本在 `origin/main` 与 HEAD **完全相同**（不在 2 个未推送 commit 的 stat 里）→ **新机必中** | 新机 `reapply` 仍报 `ok: true` /「复检无漂移」，但 `cordis.patch.yml` **不含 `pwsh-sandbox` 与 `tool-python` 两个托管块** → pwsh 沙箱指向与 pythonPath pin **双双缺失**。若新机 python 不在 `dsh-tool-python` 内置探测链覆盖范围内，则模型侧 `python` 工具从第一天起不可用（此时**升级为阻断**）。属**静默失败**——最危险的一类 |
| **B1** | **新机 profile 与开发机差 4 条 bundle、多 1 条** | 开发机实测 `dsh.profile.bundles` 15 条；`origin/main` `personal.json` `plugins[]`=10、无 `extraBundles` 字段 → 装配 12 条。缺 `dsh-personal-bar`、`dsh-computer-use`、agent-team ×2；多 `dsh-opencode-session-id` | 胶囊行整条缺失（DEPLOY.md:122 第 6 项验证**必然失败**）、computer-use 全工具组缺失、Agent Teams 层缺失 |
| **B2** | **补丁集 2/17：5 项关键修复在新机不存在** | `origin/main` 版与 HEAD 版 `apply-patches.mjs` **同为 2 补丁**（实测两个 `file:` 条目）；工作区版 21678 B / **17 补丁 + 7 项 notes 恢复** | ① `web_search` 经 opencode 网关 400 `MissingSessionID`（开箱即坏）② 胶囊行不换行 ③ 插件管理页中文名失效 ④ `llm-pi-ai` 无 `harnessSessionHeader` ⑤ 官方决策笔记未落地 |
| **B3** | **`~/.dsh` 迁移面缺 4 项，其中全局 `AGENTS.md` 缺失使所有会话行为不同；且仓库模板本身残章** | DEPLOY.md:92-103 只列 2 项；`bootstrap-personal.ps1:107` 同；DSH_HOME 实测还有 `AGENTS.md`/`github-push/`/`server-ssh/`/`.anonymous-user-id`；`config/AGENTS-global-template.md` 1434 B vs 实机 3977 B，关键词 `子代理模型分派`/`agnes`/`强档`/`弱档` 在模板中计数为 **0** | 新机无 D7 纪律、无服务纪律、无子代理强弱档分派；github-push / server-ssh 装了没凭据 |
| **B4** | **首次启动开两个页面、其中裸地址 401** | `git diff HEAD -- start-dsh-web.ps1`：HEAD 无 `--no-open`、两处 `Start-Process 'http://127.0.0.1:3080'`；工作区改为 `Get-AuthenticatedUrl`（`:28-37`）取 token 地址 + `'--no-open'`（`:184`） | 新机用户看到 2 个页面且至少 1 个 401，需手工抄 token |
| **B5** | **`settings.yaml` 模板无法「按本机修改」出开发机行为** | 模板 3805 B vs 实机 7325 B；默认模型 `opencode-go/deepseek-v4-flash` vs `opencode-live/deepseek-v4.1-flash`；模板**无 `subagent-model-selection`** | 模型路由、子代理分派策略与开发机不同；DEPLOY.md:3 的「完全相同」断言在此层不成立 |
| **B6** | **看门狗 G5 无持久化注册，DEPLOY.md 零提及** | 实测：无计划任务、无 Run 键、无服务；仅 `start-dsh-web.ps1:89-108` `Ensure-Watchdog` 拉起（`:161`/`:210` 成功路径）；DEPLOY.md 全文匹配 `看门狗\|watchdog\|G5\|计划任务\|开机自启` = **0 命中** | 新机重启后无运行期守护；`config/AGENTS-global-template.md` 却把「看门狗 G5 常驻守护服务」写成事实 |

### C 档 —— 文档瑕疵

| 编号 | 结论 | 证据 |
|---|---|---|
| **C1** | 版本声称过期：文档期望 `0.1.5-alpha.1`，实际运行 **`0.1.6-alpha.2`** | `DEPLOY.md:120` vs `node Deepseek_DSH\apps\cli\lib\bin.js --version` → `0.1.6-alpha.2`；官方克隆 HEAD `ddefc45f` 的 commit 正是 `release-dsh-0.1.6-alpha.2` |
| **C2** | 「自研插件 10 个」口径混乱（磁盘 12 / 已提交 10 / 开发机活跃 11 / 新机将装配 10） | `DEPLOY.md:10,118`、`bootstrap-personal.ps1:109` 写 10；`AGENTS.md` 写 11；`validate-plugins.mjs` 实测 `all 11 active linked plugin(s)` |
| **C3** | 端口指引无字段名：`DEPLOY.md:124` 让改 `settings.yaml` 的 `webServer port`，但两个 settings 文件里都没有该字段（3080 是官方默认） | 对模板与实机全文搜索 `port\|webServer` 无命中 |
| **C4** | `__pycache__/health-check.cpython-314.pyc` 被提交；`.gitignore` 未忽略 `__pycache__/`、`*.pyc` | `git ls-files` 命中；`.gitignore` 全文无相关规则 |
| **C5** | 4 个 `.ps1` 缺 UTF-8 BOM，违反 `AGENTS.md` 准则 5（且 `bootstrap-personal.ps1` 含大量中文） | 实测首 4 字节：`start-dsh-web.ps1`/`watchdog-dsh.ps1`/`bootstrap-personal.ps1`/`update-dsh.ps1` 均**非** BOM；对照 `sync-official.ps1`/`health-check.ps1`/`lib-proxy.ps1`/`.g5-observer.ps1`/`check-update.ps1` 均有 BOM。**注意：pwsh 7 下 UTF-8 无 BOM 可正常解析，故不阻断；属规则违反** |
| **C6** | `health-check.py` 忽略 `DSH_HOME`，而 DEPLOY.md 推荐用 `DSH_HOME` 隔离演练 | `health-check.py:35` `PROF_PKG = Path.home() / ".dsh" / ...`（对照 `validate-plugins.mjs:47`、`disable-plugin.mjs:28`、`check-plugin-copy.mjs:37` **都**尊重 `DSH_HOME`） |
| **C7** | `DEPLOY.md:21` 表述混乱（「官方仓库（`<个人仓库根>/Deepseek_DSH` 之外的独立克隆）」），且未说明其创建方法——与 A1 同源 | `DEPLOY.md:21` |
| **C8** | `DEPLOY.md:134` 给出的「重新应用补丁」命令会踩非幂等（见 §4 的 X-BUG） | `DEPLOY.md:134` + `apply-patches.mjs` 6 个 append 型补丁 |

---

## 4. 每个 BLOCKER 的最小修复动作

> 纪律约束（`DSH-ops/AGENTS.md`）：改 `.ps1` 后须语法检查 + **补回 UTF-8 BOM** + 确认无 `powershell.exe`；插件改动须过 `node validate-plugins.mjs`；用户数据改动前备份 `backups/`、整体原子重写；**主仓库更新只走 `update-dsh.ps1`**。以下动作全部在当前会话权限内（我不会执行 git commit/push）。

### 修 A0 —— 让新机拿到真正存在的健康检查入口（并修文档断链）
- **首选（随「修 B2 的提交」一起做）**：把 `health-check.cmd`、`health-check.ps1`、`启动DSH.bat`、`更新DSH.bat` 一并提交。这四者在 `origin/main` 缺失，而 `origin/main` 版 `DEPLOY.md:18`（架构速览）与 `:132`（日常维护表「双击 更新DSH.bat」）已经指向后两者 → **提交后断链自动消失**，且 `DEPLOY.md:117` 的正确表述（工作区版 `.\health-check.cmd`）才成立。
- **备选（若暂不提交）**：把 `DEPLOY.md:117` 改成不依赖包装器的写法，并**显式写出「不要用裸 `python`（可能命中 Microsoft Store 0 字节别名 stub）」**，给出 `py -3` 或绝对路径的替代命令。
- **验收**：在 `origin/main` 基线上（或一台干净 clone）确认 `Test-Path .\health-check.cmd` 与 `Test-Path .\更新DSH.bat` 均为 `True`——**这是唯一能证明文档不再断链的方法**。

### 修 A1 —— 让新机拥有平级官方克隆
- **最小动作（改文档，1 行）**：在 `DEPLOY.md` 第 1 步后新增第 1.5 步：
  ```powershell
  cd <个人仓库根>
  git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git Deepseek_DSH
  ```
  （路径必须是 `<DSH-ops 的父目录>\Deepseek_DSH`，与 `update-dsh.ps1:8`、`sync-official.ps1:37` 的派生一致。）
- **更稳的替代（改脚本）**：让 `sync-official.ps1:44` 在官方克隆缺失时**自动补 clone**而不是 `throw`；`update-dsh.ps1:18-20` 同理。改完必须过：`pwsh -NoProfile -Command "& { $null = [System.Management.Automation.Language.Parser]::ParseFile('E:\DSH\DSH-ops\sync-official.ps1',[ref]$null,[ref]$null); 'syntax OK' }"` + 补 BOM + 确认无 `powershell.exe` **新增调用**。

### 修 A2 —— 给补丁链一个确定性
- **最小动作**：在 `bootstrap-personal.ps1:42` 把 `git clone --depth 1 $OfficialUrl $copy` 改为**钉住已验证的 commit**，再按需升级：
  ```powershell
  git clone --depth 1 --branch <已验证的 tag 或 commit> $OfficialUrl $copy
  ```
  已验证基线：`ddefc45fbc7f8e46dd73185e68295696d1297887`（`0.1.6-alpha.2`，17/17 锚点命中）。
- **配套（可选但便宜）**：在 `apply-patches.mjs` 顶部加一条**版本断言**：读取 `<repoRoot>/package.json` 的 `version`，与白名单比对，不符则先打印 `警告: 官方版本 X 未在本补丁集验证过` 再继续（**不要**直接失败——失败会挡住正常的小版本升级）。这比静默 fail-loud 有信息量。
- **顺带修非原子**：`apply-patches.mjs` 的循环改为「先全部试探（只读 count），全部命中才统一写入」——`:173-187` 改成两遍扫描。这样失败时副本零改动。

### 修 A3 —— 给 node 一条定位链
- **最小动作**：在 `start-dsh-web.ps1` 里仿照 `Resolve-PwshPath`（`:70-82`）加 `Resolve-NodePath`：
  `$env:DSH_NODE_PATH` → `Get-Command node` → `$env:ProgramFiles\nodejs\node.exe` → 回退 `'node'`；
  然后把 `:127`、`:183`、`:242` 的 `'C:\Program Files\nodejs\node.exe'` 全部替换为 `$node`（`update-dsh.ps1:284` 同步）。
- **验收**：改后必须过语法检查 + 补回 BOM + 跑一次 `node validate-plugins.mjs`（闸门须仍 11 PASS）+ 确认未引入 `powershell.exe` **调用**（现有 4 处 `Name='powershell.exe'` 是 WMI 进程名匹配，**属合规，不要动**）。

### 修 B0 —— 覆盖层只转一次 JSON（工作区已修，欠「提交 + 验证」）
- **修法**：改为先建哈希表 `$localObj`，再**只调用一次** `[System.IO.File]::WriteAllText($localCfg, ($localObj | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))`。
- **状态**：工作区已于 `15:25:55` 按此修复（现行 `bootstrap-personal.ps1:141-143`，注释已记录根因）；`origin/main` **仍为双转换** → **对新机仍成立**。
- **剩余动作（两条，都很便宜）**：
  1. **提交**（并入修 B2 的提交批次）。
  2. **加断言**：在 `health-check.py` 增加一项「覆盖层结构自检」——读 `personal-hub/personal.local.json`，`json.loads` 后断言顶层是 `dict`；是 `str` 即 `exit 1` 并提示「覆盖层被双重编码，会被整层忽略」。这条断言能永久防住同类回归（本次是静默失败，无断言无法察觉）。
- 该 bug 已由 repro 记入 `buglog/2026-09-19-bootstrap-personal-ps1-personal-hub-pers.md`。

### 修 B1 —— 提交两个插件目录并把清单对齐
- **最小动作（严格顺序，缺一步就变成新的 A 档阻断）**：
  1. `git add plugins/dsh-personal-bar plugins/dsh-computer-use`（含 `README.md`/`cordis.patch.yml`/`index.js`/`package.json`/`client.js`）
  2. `git add personal-hub/personal.json`（工作区版，`plugins[]`=11 + `extraBundles`=2 + `extraPatches`=1）
  3. `git add plugins/dsh-personal-hub/index.js`（工作区版，含 `extraBundles`/`extraDependencies`/`removedBundles` 校验与「只补不删」语义）
  4. `git add plugins/dsh-personal-hub/client.js plugins/dsh-personal-hub/package.json`
  5. 提交前跑 `node validate-plugins.mjs`（须 11 PASS，**新增的 `dsh-personal-bar` 已在闸门输出中出现** → 实测已 PASS）
- **注意**：`personal.local.json` **不要**提交（`.gitignore` 已正确排除）；它的 `extraDependencies` 两条 `link:E:/DSH/...` 是机器特定值，新机必须自建（`bootstrap-personal.ps1:76-89` 会生成覆盖层，但**只填 `pwsh-sandbox`，不含 `extraDependencies`** → 见下方 B1-补）。

### 修 B2 —— 提交补丁链（注意 notes/ 是必需项）
- **最小动作（顺序敏感）**：
  1. `git add official-patches/notes/`（**11 个文件，35 万字节**；`apply-patches.mjs:194-230` 的 `restore` 段以它为唯一真相源，缺失会在 `:236` push failure → `exit 1`）
  2. `git add official-patches/apply-patches.mjs`（工作区版，17 补丁）
  3. `git add plugins/dsh-opencode-session-id/ plugins/dsh-plugin-guide/client.js plugins/dsh-deepseek-balance/ plugins/dsh-personal-hub/`（补丁效果的配套消费者）
  4. **同步更新** `DEPLOY.md:68`「2 个补丁：connection rpc 崩溃修复 + descriptor v2 兼容」→ 改为「17 个补丁（含 llm-pi-ai 会话头、web-search 会话头、胶囊行换行、插件管理页中文名覆盖）+ 7 项官方决策笔记恢复」，并同步 `bootstrap-personal.ps1` 头部注释（`:13-18` 步数说明）
  5. `ARCHITECTURE.md` 的「2 个补丁」同源表述一并更新（task-1 第 7 项已指向它）
- **验证**：`node official-patches/apply-patches.mjs <一个纯净官方副本的 packages>` 必须 17 全绿 + 7 项 restore 全绿，末行 `全部补丁应用成功 OK`。

### 修 B3 —— 把 `~/.dsh` 真正需要迁移的东西写进文档
- **最小动作（改文档 + 补模板）**：
  1. `DEPLOY.md` 第 3 步表格补 4 行：`AGENTS.md`（**从 `config/AGENTS-global-template.md` 复制并替换 `<盘符>`**）、`github-push/`（凭据）、`server-ssh/`（连接配置）、`.anonymous-user-id`（可选）
  2. `bootstrap-personal.ps1:107` 的收尾提示同步补上 `AGENTS.md`
  3. **把「子代理模型分派（个人偏好，硬规则）」整节补进 `config/AGENTS-global-template.md`**（当前 template 中 `子代理模型分派`/`agnes`/`强档`/`弱档` 计数均为 0，而实机 `~/.dsh/AGENTS.md` 有）——**这是模板功能缺失，不是文案问题**
  4. 模板里 `<盘符>:\DSH\DSH-ops\...` 的占位提示已存在（模板 `:3-6`），但 `DEPLOY.md` 未指向它 → 加一句交叉引用

### 修 B4 —— 提交 `start-dsh-web.ps1`（token/单页面修复）
- **最小动作**：`git add start-dsh-web.ps1`（工作区版）。**验收**：改后须过语法检查 + 补回 **UTF-8 BOM**（当前无 BOM，见 C5）+ 确认未新增 `powershell.exe` 调用。**风险提示**：这条修复依赖 `dsh-web.log` 里 `dsh web: <url>` 行存在（实测 ✅ 匹配 `GetAuthenticatedUrl` 正则），且它把「开浏览器」收敛为单来源——**不要**再往启动链加第二处开浏览器的调用（`AGENTS.md` 明令）。

### 修 B5 —— 降低 `settings.yaml` 的期望，或提供更完整的模板
- **最小动作（文档）**：`DEPLOY.md:143` 的「已知差异」条目补两句：① 默认模型路由与开发机不同（`opencode-go/deepseek-v4-flash` vs `opencode-live/deepseek-v4.1-flash`）；② **`subagent-model-selection` 段模板缺失，新机需自行配置**，否则子代理模型分派行为与开发机不同。
- **可选（代码）**：把实机 `settings.yaml` 的**结构骨架**（键名 + 占位值，**绝不含任何密钥**）补进 `config/settings.yaml`，使「按本机修改」有完整落点。

### 修 B6 —— 让看门狗可开机存活（并写进文档）
- **最小动作（文档，零风险）**：`DEPLOY.md` 新增一节「运行期守护（G5 看门狗）」：说明它由 `start-dsh-web.ps1` 成功路径拉起、**无开机自启**、重启后需跑 `start-dsh-web.ps1` 或 `health-check.cmd` 复活。
- **可选（脚本，需用户决策）**：加一个可选的计划任务注册（`Register-ScheduledTask`，登录时启动 `watchdog-dsh.ps1`）。**注意**：这会改变机器的自启行为，属用户决策项；且必须在 `DEPLOY.md` 里显式说明如何卸载。**不要在未确认时自动注册。**

### 修 C1–C8
- **C1**：`DEPLOY.md:120` 的 `0.1.5-alpha.1` → `0.1.6-alpha.2`（或改为「以 `--version` 实际输出为准」，并说明本机基线是 `0.1.6-alpha.2`）。
- **C2**：按 §2.4 的表格改写 `DEPLOY.md:10,118` 与 `bootstrap-personal.ps1:109`。
- **C3**：`DEPLOY.md:124` 补字段名与 schema 出处（或用 `node Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` 查实际端口），不要只写「改 webServer port」。
- **C4**：`git rm --cached __pycache__/health-check.cpython-314.pyc`；`.gitignore` 增 `__pycache__/` 与 `*.pyc`。
- **C5**：给 `start-dsh-web.ps1`、`watchdog-dsh.ps1`、`bootstrap-personal.ps1`、`update-dsh.ps1` 补 UTF-8 BOM。**注意顺序**：BOM 必须在**所有编辑完成之后**统一补，否则后续编辑工具可能再次剥离。
- **C6**：`health-check.py:35` 改为 `Path(os.environ.get("DSH_HOME") or Path.home()/".dsh")`，与 `validate-plugins.mjs:47` 保持一致（**注意**：这条会改变体检对象，须在改后跑一次 `pwsh -NoProfile -File health-check.ps1` 确认仍全绿）。
- **C7**：`DEPLOY.md:21` 改写为「官方仓库是 `<DSH-ops 的父目录>\Deepseek_DSH` 的独立克隆，仅升级链使用；第 1.5 步创建」。
- **C8**：见下 X-BUG 的修法。

---

## 5. 额外发现：一个可复现的真 BUG（非部署链，但会咬人）

### X-BUG — `apply-patches.mjs` 的 6 个 append 型补丁**不幂等**，二次应用会重复插入内容

**症状（实测）**：在一个**已打过补丁**的副本上重跑补丁脚本，17 个锚点里有 **6 个仍然 count==1**：

```
--- COPY E:\DSH\DSH-ops\Deepseek_DSH\packages (已打补丁) ---
  [   OK] count=1  llm/llm-pi-ai/src/adapter.ts          ← 第 7 个补丁（插 sessionId 计算）
  [   OK] count=1  llm/llm-pi-ai/tests/adapter.spec.ts   ← 第 9 个
  [   OK] count=1  llm/llm-pi-ai/tests/adapter.spec.ts   ← 第 10 个
  [   OK] count=1  llm/llm-pi-ai/README.md               ← 第 12 个（段落追加）
  [   OK] count=1  llm/llm-pi-ai/README.zh.md            ← 第 14 个（段落追加）
  [   OK] count=1  client/ui-plugin-manager/src/client/presentation.ts ← 第 17 个（追加 deploymentCopy 函数）
```

**根因**：这 6 个补丁是 **`new = old + 追加内容`** 形态——`old` 是 `new` 的**子串且保持连续**，所以第一次应用之后 `old` 仍然恰好出现 1 次，`apply-patches.mjs:181` 的 `count !== 1` 守卫**不会**拦住第二次。对照另外 11 个是**替换型**（`old` 被吃掉了，二次应用时 count==0 → 正确 fail-loud）。

**后果（新机上会真的发生）**：
- `client/ui-plugin-manager/src/client/presentation.ts` 会出现**两份 `function deploymentCopy()`** → TS2393 Duplicate function implementation → `pnpm run build` 失败；
- `llm/llm-pi-ai/src/adapter.ts` 会出现**第二个 `const sessionId`** → 重复声明 → 编译失败；
- `README.md` / `README.zh.md` 会多出一段重复说明；`adapter.spec.ts` 会多出两组重复测试。
- `DEPLOY.md:134` **明确给出**「重新应用补丁：`node .\official-patches\apply-patches.mjs .\Deepseek_DSH\packages`」这条指引 —— **用户照着做就会中招**。脚本也不会报警（`count==1`，一切「正常」）。

> 说明：本次只读到 6 个锚点在**当前副本**中仍命中。严格说「这 6 个就是 append 型」需要再看 `new` 里 `old` 是否连续——我已按 `apply-patches.mjs:42-50/55-56/85-92/104/116/152-168` 逐个核对，均为「原文保留 + 追加」。**未实际执行二次打补丁**（任务禁止改被审文件），因此这是**静态判定 + 锚点计数实证**，不是「跑出来的破坏」。**故我未修复，只记录。**

---

## 6. 对 §1「漏报排查」a–f 六项的逐项结论

| 项 | 结论 | 一手证据 |
|---|---|---|
| **a.** `.gitignore` 是否让仓库缺新机必需文件 | **否**（ignore 本身正确）——缺件是**漏 add**，不是被 ignore。`.gitignore` 只排除 `*.log`/`dsh-web.pid`/`backups/`/`watchdog.heartbeat`/`node_modules/`/`personal.local.json`/`Deepseek_DSH/`，全是正确的排除。两个整目录插件 + `check-plugin-copy.mjs` + `plugin-display-names.md` + `PERSONAL-CAPSULES.md` + `official-patches/notes/` 都是**未 add** | `git ls-files` vs 磁盘差集（§1.2）；`.gitignore` 全文 |
| **b.** 密钥/产物误提交 | **密钥：干净**（0 命中真实密钥，只命中 5 个 buglog 文件名）；**产物：1 处污点** `__pycache__/health-check.cpython-314.pyc` 已入库且 `.gitignore` 未覆盖 | §1.3 |
| **c.** 未提交改动清单（**本次最重要**） | **HEAD `05e2dda0` / 2026-09-17 10:30 / ahead 2；24 个 M + 2 个整目录 ??**；部署链关键件 `start-dsh-web.ps1`、`apply-patches.mjs`、`personal.json`、`dsh-personal-hub/index.js`、两个插件目录**全部未提交**。**ahead 2 不足以改变结论**（那两个 commit 主要是 buglog 与 55 行 reapply 细节） | §1.1、§1.2 |
| **d.** 首次启动路径 | **能起来**（凭据惰性解析，`DEPLOY.md:103` 成立）；**端口 3080 = 官方默认**（两个 settings 文件均无该字段）；**token 来自 `dsh-web.log` 单行**（实测，正则精确匹配）。**但**：HEAD 版启动脚本会开**两个**页面且其中裸地址 **401**（B4） | §1.5、§2.5 |
| **e.** 看门狗 G5 落地方式 | **无计划任务 / 无 Run 键 / 无服务**（实测三面皆空），仅由 `start-dsh-web.ps1:89-108` 成功路径拉起；`DEPLOY.md` **零提及** | §1.6 |
| **f.** 补丁与官方 HEAD 耦合 | **无任何版本上界校验**；实测纯净官方克隆 17/17 命中（对得上**开发机所用版本**），但新机 clone 的是**当天 HEAD**（`--depth 1`，无 branch/tag 固定），本机基线已落后 ~2 天；失败非原子；另有 6 个补丁非幂等（§5） | §1.4、§5 |
| **g.**（本审核新增，a–f 之外）**新机真实基线是什么** | 任务描述与 Lead 简报都默认「新机 = HEAD」。**实测：新机从 GitHub 拿到的是 `origin/main` = `1adc2535cd`（09-09），292 文件，比 HEAD 少 46 个**，其中含 `health-check.cmd/.ps1`、`启动DSH.bat`、`更新DSH.bat`、`prune-copy.mjs`。**新机读到的 DEPLOY.md 也因此是 09-09 版，L117 教的是裸 `python`** | §1.1b（含 46 文件差集表与 L117 逐版对照） |

---

## 7. 对 A/B/C 三份产出的逐条判定

> 三份产出已于 `15:23:13`–`15:24:39` 全部落盘，本节为完整复查结果。
> **前提警告**：三份产出都在 `15:25:55` 的批量修复**之前**写成，其针对 `bootstrap-personal.ps1` 的行号**已在事后失效**（见 §1.7）。判定表按「对**新机**（`origin/main` 基线）是否成立」给出，不按「对当时工作区是否成立」。

### 7.1 BLOCKER 全量复查

| 原结论（出处） | 判定 | 我的一手证据 / 反证 |
|---|---|---|
| **docs-B1** 第 0 步漏 Python → 新机验收第 1 条必红 | **部分成立：结论对，机制错，对新机的量化不足** | ①「第 0 步表格无 Python」**成立**——我独立全文匹配 `DEPLOY.md` 无 `Python`/`python` 依赖行；②但 docs 引用的 `DEPLOY.md:113-117` 是**工作区版**，而**新机读的是 `origin/main` 版 L117 = `` `python .\health-check.py` ``**，且 `health-check.cmd`/`health-check.ps1` 在新机**根本不存在**（§1.1b 的 46 文件差集实测）。真机制是**「包装器缺失 + 文档教裸 python」**（我的 A0），不是「`health-check.cmd` 跑红」；③docs 的修法（第 0 步加 Python 行）**仍正确且必要**，但不够——还须同时让文档不再教裸 `python` |
| **docs-B2 / scripts-BLOCKER-1** 平级官方 checkout 缺失 → 升级链 100% 失败 | **成立（本次最扎实的一条，两份独立得出同一结论）** | 我独立实测全部关键行号真实存在：`update-dsh.ps1:8` `Split-Path $ops -Parent`、`:18-20` `exit 1`；`sync-official.ps1:37`/`:44`；`bootstrap-personal.ps1:42` 只 clone **副本**。并追加验证**该问题在 `origin/main` 版同样存在**（`git show origin/main:update-dsh.ps1` 仍有「错误: 未找到仓库 $repo」；`origin/main` 版 bootstrap 无 `officialRoot`）→ **新机必中** |
| **docs-B3** 缺 `extraDependencies` → 新机 `dsh-computer-use` patch 行 `failed to import`（列为 **BLOCKER**） | **证据真实，但分档不成立 → 改判 INCONSISTENT（且属「提交后」风险）** | **反证**：该结论的前提是「新机 profile 会装配 `dsh-computer-use`」，而 `origin/main` 版 `personal.json` 的 `plugins[]` **不含**它、`plugins/dsh-computer-use/` 目录也**不在** `origin/main`（§1.2 差集）→ **新机根本不会有那条 insert 行**，`failed to import` **无从发生**。docs 三条证据本身都真实（我复核 `plugins/dsh-computer-use/cordis.patch.yml`、`index.js` 的 `extraDependencies` 语义、`personal.local.json` 的两条 link），但它们描述的是**「提交工作区 `personal.json` 之后」的中间态**。**scripts 的 INCONSISTENT-3 分档比 docs 更准确** |
| **scripts-BLOCKER-2** `node.exe` 绝对路径硬编码 4 处 | **成立，且与我的独立扫描逐字吻合** | 我独立扫描得到**完全相同的 4 处**：`start-dsh-web.ps1:127`（闸门）、`:183`（**服务本体**）、`:242`（隔离坏插件）、`update-dsh.ps1:284`。并独立确认 `start-dsh-web.ps1:70-82` 的 `Resolve-PwshPath` 有完整定位链、`watchdog-dsh.ps1:173-174` 有 node 定位链 → **同一文件内自相矛盾的「半修」状态**（scripts 也发现此反证，两条独立发现互证）。本机实测 `C:\Program Files\nodejs\node.exe` **存在** → 开发机无感，新机非标准安装位必死 |
| **repro-§3.1**「新机 clone 拿到的是 **HEAD**，而 HEAD 与本机工作区差异巨大」 | **不成立（基线错误）—— 需按 `origin/main` 重写** | **反证**：`git status -sb` = `## main...origin/main [ahead 2]`；`git log origin/main -1` = `1adc2535cd`，`2026-09-09 16:44:56`，即**新机拿到的是 09-09，不是 HEAD（09-17）**。实测文件数：`origin/main` **292** vs HEAD **338**，**差 46 个文件**。repro 用的 `HEAD=05e2dda0…` 是**本地 HEAD**，不是 clone 结果。其**方向性结论仍正确**（「在完成提交之前『新机部署出完全相同的 DSH』在事实上不成立」），且它列出的 3 条差异全部真实；但**量化不足**：漏掉了 2 个未推送 commit、46 个文件（含 `health-check.cmd/.ps1`、`启动DSH.bat`、`更新DSH.bat`、`prune-copy.mjs`）、以及 `origin/main` 版 DEPLOY.md L117 的裸 `python` 差异。**它是唯一试图回答「新机到底拿到什么」的报告，方向对、基线错** |
| **repro-§2.2 缺陷 A**：`bootstrap-personal.ps1` 双重 `ConvertTo-Json` → 覆盖层被整层静默忽略 | **成立（我已独立复现，非采信）** | 我**没有**采信 repro 的沙箱产物（其场景 B 文件已被场景 C 覆盖），而是独立重跑：`$once = @{...} \| ConvertTo-Json -Depth 5; $twice = $once \| ConvertTo-Json -Depth 5` → 输出**以 `"` 开头**、`ConvertFrom-Json` 得 **`System.String`**（单次转换对照得 `PSCustomObject`）；源码侧 `index.js:224` `JSON.parse(...)` + `:228` `typeof local === 'object'` → 字符串被拒 → 跳过 `mergeOverlay`。`origin/main` 版 bootstrap **仍是**双转换（实测 `git show origin/main:bootstrap-personal.ps1` 连续两行 `ConvertTo-Json`）→ **新机必中，且静默**（`ok: true`） |
| **repro-§2.3** 场景 C：结构正确的覆盖层 → 产物 `dependencies` 与 `bundles` 与开发机**完全相同** | **成立** | 与我的独立推理一致（§2.1 的五步链条证明 reapply 的派生逻辑本身无缺陷）；差异全部可归因到「覆盖层 + 清单 + 插件目录」三层，而非装配算法 |

### 7.2 INCONSISTENT 抽查（复盖 docs 9 条中的 4 条、scripts 9 条中的 5 条）

| 原结论 | 判定 | 我的证据 |
|---|---|---|
| docs-I1：第 3 步只列 2 个文件，开发机实际 6 类用户数据 | **成立，且我另有深化** | 我实测 DSH_HOME 顶层 10 个条目；DEPLOY.md 第 3 步只列 `settings.yaml` + `.credentials.yaml`。**深化（docs 未提）**：`config/AGENTS-global-template.md` 与开发机 `~/.dsh/AGENTS.md` **不等价**（1434 B vs 3977 B），模板**整章缺失「子代理模型分派」**（关键词 `子代理模型分派`/`agnes`/`强档`/`弱档` 在模板中计数 **0**）→ 即使照模板部署也拿不到该硬规则（我的 B3） |
| docs-I3：插件「10 个」全线过时（实际 12 目录 / 11 挂载 / 11 PASS） | **成立，但需按基线分三档** | 我实测：磁盘 **12**、`validate-plugins.mjs` 末行 **`all 11 active linked plugin(s)`**、`origin/main` 与 HEAD 都是 **10 个目录 + 10 个 PASS 口径**。**纠正**：文档的「10」对 `origin/main`（新机）**是准确的**，对开发机才过时 → 属「版本落后」而非「文档错误」（§2.4） |
| docs-I5：「补丁 2 个」过时（实际 17 条 + 7 项恢复） | **成立，同样需分档** | 我实测 `origin/main` 版**也是 2 条**（两条 `file:`）→ 文档 L68 对新机准确、对开发机过时。真修法是提交（§4 修 B2），不是改文档 |
| docs-I6：看门狗 G5 完全没进部署文档 | **成立** | 我独立三面实测：无计划任务、无 Run 键、无服务；仅 `start-dsh-web.ps1:89-108` 成功路径拉起；DEPLOY.md 全文匹配 `看门狗\|watchdog\|G5\|计划任务\|开机自启` = **0** |
| scripts-INCONSISTENT-1：两个 `.bat` 只用裸 `pwsh.exe` | **成立（对开发机/HEAD）；对新机需换一种说法** | 我实测两个 `.bat` 内容确为 `pwsh.exe -NoProfile ...`（无路径解析）。**但对新机**：这两个文件**不在 `origin/main`**（§1.1b）→ 新机的问题是**文件不存在**（我的 A0），不是「裸 pwsh」。这是「同一现象、两套基线、两种严重度」的又一例 |
| scripts-INCONSISTENT-3：bootstrap 模板缺 `extraDependencies` → computer-use 装配与开发机不同（判为 INCONSISTENT） | **成立，分档正确（优于 docs-B3）** | 与我对 docs-B3 的改判一致。**补注**：该缺口在 `15:25:55` 已被工作区修复（bootstrap L131-134 现在生成两条 link），但 `origin/main` **不含**该修复 → 对新机仍成立 |
| scripts-INCONSISTENT-6：4 个核心 `.ps1` 缺 UTF-8 BOM | **成立** | 我独立实测首 4 字节：`start-dsh-web.ps1`/`watchdog-dsh.ps1`/`bootstrap-personal.ps1`/`update-dsh.ps1` 均**无** BOM；对照 `sync-official.ps1`/`health-check.ps1`/`lib-proxy.ps1`/`.g5-observer.ps1`/`check-update.ps1` **有** BOM。**注意**：`15:25:55` 的那批修复若只改内容未补 BOM，该问题依旧（且 `AGENTS.md` 准则 5 要求「改 .ps1 后补回 BOM」）——**这是一条待验证的回归风险** |
| scripts-INCONSISTENT-7：`health-check.py` 用裸 `pwsh`/`node` 且无异常处理 | **证据充分，未逐字复核** | 我确认 `health-check.py:35` 用 `Path.home()` 硬解析 profile（忽略 `DSH_HOME`）——与 scripts 的判定同向；其「裸 pwsh/node」部分我未逐行复核，标**证据充分但非我复核** |
| scripts-INCONSISTENT-9：`check-update.ps1` 把「目录不存在」误报成网络故障 | **成立（与我独立发现同源）** | 我实测 `check-update.ps1:6` 确实用 `Split-Path $ops -Parent` 派生官方目录；而 `启动DSH.bat:8` 每次启动都调它 → 新机每次启动都会打印误导性的网络故障提示 |

### 7.3 对三份产出「建议修法」的可行性复核（硬规则符合性）

| 检查项 | 结论 |
|---|---|
| 是否违反「`.ps1` 须 UTF-8 BOM」 | ⚠️ **实测：6 个被改文件里 5 个已补 BOM，`update-dsh.ps1` 仍缺**——`bootstrap-personal.ps1`=True、`check-update.ps1`=True、`start-dsh-web.ps1`=True、`sync-official.ps1`=True、`watchdog-dsh.ps1`=True、**`update-dsh.ps1`=False**（首 3 字节实测）。6 个文件语法检查均 **0 错误**。→ **`update-dsh.ps1` 违反准则 5，是本次修改引入的不一致（其余 5 个都补了，只漏它）**，需补 BOM。（对照未改动的 `health-check.ps1`/`lib-proxy.ps1`/`.g5-observer.ps1` 均有 BOM；`health-check.cmd` 无 BOM 属正常，批处理带 BOM 反而有害） |
| 是否违反「禁 `powershell.exe`」 | ✅ 未违反，且**本次修改没有新增**。实测 6 个文件命中 `powershell.exe` 共 3 处：`start-dsh-web.ps1` 2 处、`watchdog-dsh.ps1` 1 处——**全部**是 `Get-CimInstance -Filter "Name='powershell.exe' OR Name='pwsh.exe'"` 的**进程名匹配**，不是调用（与修改前一致）。任何把它报成违规的结论都不成立（反例库 3） |
| 是否违反「插件改动须过 `validate-plugins`」 | ✅ 未违反。六文件批量修复**不含** `plugins/**`；且我实测闸门当前 `all 11 active linked plugin(s) safe to load`、`exit 0` |
| 是否破坏运行中的环境 | ⚠️ **有实际风险**：① `watchdog-dsh.ps1` 在 15:25:55 被改，而**看门狗进程（PID 37544）正在运行旧代码**——改动不会热加载，但下次拉起会用新代码；② `watchdog.heartbeat` 于 15:26:13 更新，说明看门狗仍活着；③ `start-dsh-web.ps1` 被改**不影响正在运行的服务**（只在下次启动生效）。**结论：无立即破坏，但「改了正在守护的进程的脚本而未重启验证」是一个应显式记录的状态** |
| 三份产出的修法之间是否冲突 | ⚠️ **有一处冲突需 lead 裁决**：scripts-BLOCKER-1 的修法 A 主张「统一到副本（改脚本逻辑）」，docs-B2 的修法则主张「补文档 + 让平级目录成为必需部署物」。`15:25:55` 的修复**同时做了两件**——新增 `$officialRoot` 平级 clone（= 走 docs 路线，`bootstrap-personal.ps1:56`）**且**可能在脚本里加了回退（需 lead 确认）。两条路线并存会让「官方目录」有两个真相源，**建议只保留一条** |

### 7.4 三份产出共同漏掉的（本审核员的补漏，去重后）

1. **新机真实基线是 `origin/main` 而非 HEAD**（§1.1b）——三份产出**都没有**做这一步比对（repro 唯一尝试，但结论写成了 HEAD）。
2. **`origin/main` 版 DEPLOY.md L117 教裸 `python`，且 `health-check.cmd/.ps1` 在新机不存在**（A0）——docs-B1 的机制与此不同。
3. **`启动DSH.bat` / `更新DSH.bat` 不在 `origin/main`**，而文档 L18/L132 指向它们（A0 第二部分）。
4. **`config/AGENTS-global-template.md` 整章缺失「子代理模型分派」**（B3 深化）。
5. **`settings.yaml` 模板缺 `subagent-model-selection` 段**——不是「按需要调整」能补出的行为规则（B5）。
6. **`__pycache__/health-check.cpython-314.pyc` 被提交入库**（C4）。
7. **`apply-patches.mjs` 6 个 append 型补丁非幂等 + 写入非原子**（§5，已单独 `bug_report`）。
8. **`health-check.py` 忽略 `DSH_HOME`**（C6）。

### 7.5 已预备的判据（复查时直接引用，避免临时取证）

- 反例库 1：`启动DSH.bat` / `更新DSH.bat` **已跟踪**（quotepath 陷阱）——若 A/B 报告称其「未提交/缺失」→ **不成立**。
- 反例库 2：`sync-official.ps1` / `update-dsh.ps1` 的 `E:\DSH\...` 只出现在**注释/帮助块**（`sync-official.ps1:5-6`），代码里是 `$PSScriptRoot` 派生 → 若 B 报告称「硬编码 E:\DSH 盘符」→ **不成立**（真问题是**平级官方克隆缺失**，即 A1）。
- 反例库 3：`powershell.exe` 在 `start-dsh-web.ps1:91,112`、`watchdog-dsh.ps1:60`、`health-check.py:96` 共 4 处，**全部**是 `Get-CimInstance -Filter "Name='powershell.exe' OR Name='pwsh.exe'"` 的**进程名匹配**，不是调用 → 若报告列为「违反禁 powershell.exe 规则」→ **不成立**。
- 反例库 4：新机 bootstrap **不会失败**（§2.1 五步推理链）→ 若报告称「新机 reapply 会因缺插件而失败」→ **不成立**（真问题是「成功但不同」）。
- 反例库 5：`dsh-opencode-session-id` 在磁盘上但**不在开发机 profile bundles**（15 条里没有它），`validate-plugins.mjs` 只校验**活跃** link 插件（实测 11 个）→ 若报告称「磁盘 12 个插件应全部 PASS」→ **不成立**，正确理解见 §2.4。
- 反例库 6：`config/settings.yaml` 里**没有** `webServer`/`port` 字段，3080 是官方默认 → 若报告称「端口在模板里配置」→ **不成立**。
- 反例库 7（**基线类，最容易被整份报告踩中**）：新机 clone 得到的是 **`origin/main`（09-09，292 文件）**，不是 HEAD（09-17，338 文件）。凡结论中出现「新机拿到 <某文件>」而该文件只存在于 HEAD 或工作区（例如 `health-check.cmd`、`启动DSH.bat`、17 补丁版 `apply-patches.mjs`、`check-plugin-copy.mjs`）→ **该结论对新机不成立**，须改为「开发机有、新机没有」。反之，凡把「文档说 2 个补丁 / 10 个插件」报成**文档错误**的 → **不成立**，那是 `origin/main` 快照的**准确**描述，真问题是版本落后。
- 反例库 8：`origin/main` 版 `sync-official.ps1` **不引用** `prune-copy.mjs`（该文件当时还没入库），两版自洽 → 若报告称「新机 sync 会因缺 prune-copy.mjs 而失败」→ **不成立**（新机 sync 失败的真因是 A1 的平级官方克隆缺失）。

---

## 8. 复查者备忘（未竟事项与不确定性）

**未做实测的项（诚实标注）**：
1. **未实测新机场景**（无第二台机器、不允许 clone/`pnpm install`）。所有「新机将如何」的结论都是**对当前仓库状态 + 脚本源码 + 隔离实测数据的组合推理**，每一环都给了文件:行，但整体链条未经端到端跑通。
2. **未实测「服务在无 `settings.yaml`/`.credentials.yaml` 时启动」**（任务禁止启停服务）→ §1.5 该条标为「成立（间接证据）」。
3. **未实测官方「今天」的 HEAD**（禁止网络 clone）→ A2 的「2 天差」只能证明**存在时间差**，不能证明官方这 2 天改了哪 17 处中的任何一处。**要坐实 A2，需要在新机（或临时目录）跑一次 `git clone --depth 1` + 只读锚点计数**——这是唯一能把 A2 从「风险」升格为「事实」的动作。
4. **未实际二次打补丁**（任务禁止改被审文件）→ §5 的 X-BUG 是**静态判定 + 锚点计数实证**：证明「6 个锚点在已打补丁副本上仍 count==1」，未证明「重复函数声明必然导致 build 失败」（该因果由 TS 语义保证，属常识推理）。

**交给 Lead 的决策点**：
- B6 的「计划任务注册」是**改变机器行为的动作**，需用户明确同意，我不建议在本次审核中自动执行。
- A2 的「钉住 commit」会牺牲「永远跟官方最新」的便利；若用户更看重紧随官方，则应改为「补丁失败时打印可读的升级指引 + 保持副本原子性」而非钉死 commit。二者取一，属用户取向。
