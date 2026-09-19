# A-文档层审核结论（DEPLOY.md / ARCHITECTURE.md）

审核对象：`DEPLOY.md`（146 行）、`ARCHITECTURE.md`（75 行）、`bootstrap-personal.ps1`（109 行）、`reapply-cli.mjs`、`personal-hub/personal.json`、`personal-hub/personal.local.json`、`official-patches/apply-patches.mjs`、`plugins/`、`config/`
审核方式：只读静态核对 + 只读实测（`node validate-plugins.mjs`、`node check-plugin-copy.mjs`、`node apps/cli/lib/bin.js --version`、`Get-ScheduledTask`、`Get-ItemProperty HKCU/HKLM ...\Run`、`Get-CimInstance Win32_Process`、`git remote -v`）
审核时点：2026-09-18（本机实测环境：node v24.16.0 / pnpm 11.22.0 / pwsh 7.6.4 / git 2.47.1.windows.2；`DSH-ops` HEAD = `05e2dda00d chore: DSH sync`）
结论摘要：**BLOCKER 3 条、INCONSISTENT 9 条、NIT 8 条**。核心判断：**照 DEPLOY.md 在新机可以部署出一套能启动的 DSH，但不等于开发机那套**——8 处生成物/用户数据在文档里缺失或过时，另 2 处会让新机的首次部署或日常升级链直接硬失败。

---

## 一、BLOCKER（阻断部署 / 阻断文档承诺的链路）

### B1. 第 0 步环境依赖清单漏了 Python 3 —— 新机「验收第 1 条」必红，python 工具不可用

**结论**：DEPLOY.md 第 0 步表格没有 Python，但本机部署链有两个硬依赖 Python 的环节，新机照文档装完环境后 `health-check.cmd` 必然失败、`python` 工具不可用。

**证据**
- `DEPLOY.md:27-34`（第 0 步表格）依赖项只有 Git / Node / pnpm / PowerShell 7 / VS Build Tools / 网络；全文 grep `python|Python` 命中 0 处（grep 结果仅有 pnpm 行 L31）。
- 依赖 1（体检链）：`health-check.cmd:20`（`"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0health-check.ps1" %*`）→ `health-check.ps1`；`health-check.ps1:34` `function Find-Python`，`:74-79` 找不到解释器即输出红字「未找到可用 python。请安装 Python 3.12+，或在 personal-hub\personal.local.json 配置 dsh-tool-python 的 pythonPath」并非 0 退出。而 DEPLOY.md:113-117 把「`.\health-check.cmd` → 全绿」列为验收第 1 条，并声明「全部通过才算部署成功」。
- 依赖 2（工具链）：`personal-hub/personal.json:18`（plugins[] 含 `dsh-tool-python`）→ 该插件是 profile bundle；`plugins/dsh-tool-python/index.js:405-407` 无解释器时每次调用抛 `tool-python: 未找到可用的 Python 3（已尝试 DSH_PYTHON_PATH、py -3 启动器、PATH 上的 python、标准安装目录；PATH 上的 WindowsApps 存根已被排除）`。
- 机器特定性：本机 `personal-hub/personal.local.json:9` 把解释器 pin 成 `C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe`，该文件被 `.gitignore:11` 排除 → 新机没有这条 pin，只能走插件内置定位链（`index.js:60-61` 顺序：`DSH_PYTHON_PATH` → `py -3` → PATH `python` → 标准安装目录）。
- 实测裸 `python` 在本机解析到 MS Store 桩：`python --version` → `Python was not found; run without arguments to install from the Microsoft Store...`，`[exit code: 1]`。

**影响**：新机按文档验收必然卡在第 1 条（`health-check.cmd` 红），且模型面向的 `python` 工具从第一天起就不可用。这同时会把「新机与开发机行为相同」的前提打破（开发机 python 工具可用）。

**建议修法**：`DEPLOY.md` 第 0 步表格（L27-34）增加一行：`| Python | 3.12+（python.org 安装，勾选 py launcher；勿用 Microsoft Store 版） | py -3 可用；health-check.cmd 与 dsh-tool-python 依赖它 |`；并在第 3 步（L92-103）或「已知差异/边界」（L139-146）补一句：新机若把 Python 装在非标准位，需在 `personal-hub/personal.local.json` 为 `dsh-tool-python` 配 `patch.config.pythonPath`。

---

### B2. 新机不会存在「平级官方 checkout」，文档承诺的日常升级链（更新DSH.bat / update-dsh.ps1）100% 失败

**结论**：`DEPLOY.md` 第 1-2 步只 clone 个人仓库、并把官方仓库 clone 进 `DSH-ops\Deepseek_DSH`；而 `update-dsh.ps1` 硬依赖**与 DSH-ops 平级**的 `<根>\Deepseek_DSH`，缺失时直接 `exit 1`（不会自动 clone）。文档从未给出创建它的步骤，却在「日常维护」表首行推荐使用它。

**证据**
- `update-dsh.ps1:5-8` 路径约定「官方仓库为同级 `<root>\Deepseek_DSH`」；`:18-21` `if (-not (Test-Path (Join-Path $repo '.git'))) { Write-Both "错误: 未找到仓库 $repo"; exit 1 }`。
- 开发机确实存在该平级克隆（实测 `Test-Path E:\DSH\Deepseek_DSH\.git` → `True`；`git -C E:\DSH\Deepseek_DSH remote -v` → `origin https://github.com/deepseek-ai/deepseek-harness.git`）。
- 文档侧：`DEPLOY.md:21` 只说「官方仓库（`<个人仓库根>/Deepseek_DSH` 之外的独立克隆）只在升级时使用，日常运行不依赖它」；第 1 步（L45-49）只 clone 个人仓库；第 2 步第 1 项（L66）是 `git clone --depth 1` 到 `.\Deepseek_DSH\`（bootstrap-personal.ps1:40-43）。全流程没有任何一处创建平级官方克隆。
- `DEPLOY.md:130-135`「日常维护」表第 1 行：`升级官方 + 同步副本 | 双击 更新DSH.bat（update-dsh.ps1：…）`。

**影响**：新机首次部署不受影响，但用户一旦执行文档推荐的日常升级，第一条命令即报「错误: 未找到仓库 <根>\Deepseek_DSH」并退出 1；此后官方版本再也无法更新（副本也就停在新机部署当天的官方 HEAD）。

**建议修法**：`DEPLOY.md` 第 2 步末尾（L79 之后）新增一段：`cd <个人仓库根>\..` + `git clone https://github.com/deepseek-ai/deepseek-harness.git Deepseek_DSH`（并说明它只作升级源，不入个人 git）；或改 `update-dsh.ps1:18-21`，缺失时自动 `git clone` 后继续。

---

### B3. `extraDependencies`（computer-use 的两条 link）无人创建 —— 新机 `dsh-computer-use` 的 patch 行会 `failed to import`

**结论**：`dsh-computer-use` 在共享清单里，它的 bundle patch 会插入两行官方包名；这两个裸包名必须在 **profile 的 dependencies** 里可解析，而承载它们的 `personal.local.json` 被 gitignore，且 bootstrap 自动生成的覆盖层**不含** `extraDependencies` —— 新机缺这两条 link。

**证据**
- `plugins/dsh-computer-use/cordis.patch.yml:14-18`：`insert:` → `id: computer-use / name: '@deepseek-ai/dsh-computer-use'`、`id: computer-use-cua-driver-native / name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'`。
- `plugins/dsh-personal-hub/index.js:557-563`（注释即权威语义）：「`manifest.extraDependencies` — bare packages the PROFILE itself must resolve … a bundle patch can insert an official package row whose bare name resolves against the CONFIG DIRECTORY (app-boot's `boot()`), not against the install anchor; **without a profile-level dependency that row fails with `failed to import`**」；`:564-569` `expectedDependencies()` 把它并入 profile dependencies。
- 这两条目前只存在于 `personal-hub/personal.local.json:24-27`（`link:E:/DSH/DSH-ops/Deepseek_DSH/packages/computer-use/computer-use` 等），该文件被 `.gitignore:11` 排除；`:24` 的 `_extraDependenciesComment` 自述「换机器时按本机副本路径重写」。
- `bootstrap-personal.ps1:76-87`：覆盖层缺失时只写 `extraPatches = [{ id='pwsh-sandbox', config={ pwshPath=$pwshPath } }]` —— 无 `extraDependencies`、无 tool-python pythonPath。
- 开发机 profile 侧对照（实测）：`C:\Users\Administrator\.dsh\profiles\web\package.json` 的 `dependencies` 含 `@deepseek-ai/dsh-computer-use` 与 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native`（`node_modules/@deepseek-ai` 下两条 `link` 指向副本 `packages\computer-use\computer-use`、`packages\experimental\computer-use-cua-driver-native`）。

**影响**：新机 `reapply` 仍会报成功（清单里没有 extraDependencies 就不算漂移，`index.js:582-590` 只按清单比对），但启动时该 insert 行 `failed to import`；按 `start-dsh-web.ps1:237-249` 的 G3 兜底，会先把 `dsh-computer-use` 移出 bundles 再重试 —— 结果：**服务能起，但新机永久少一套 computer-use 能力**，且首次启动要多失败一轮。

**建议修法**（二选一，改代码更彻底）：
1. `bootstrap-personal.ps1:80-85` 生成覆盖层时补 `extraDependencies`，值用 `$copy` 实测路径派生（`link:$(($copy -replace '\\','/'))/packages/computer-use/computer-use` 等两条）；
2. 或在 `plugins/dsh-personal-hub/index.js` 里对 `dsh-computer-use` 这类「patch insert 官方 workspace 包」的插件自动补 profile 依赖。
   同时 `DEPLOY.md` 第 2/3 步要写明：`personal.local.json` 除 pwsh 路径外还承担 `extraDependencies` 与 `pythonPath`（见 I7）。

---

## 二、INCONSISTENT（能部署，但结果与开发机不同）

### I1. 第 3 步「用户数据」只列了 2 个文件，实际开发机有 6 类必需用户数据

**结论**：`DEPLOY.md:92-103` 只要求 `settings.yaml` 与 `.credentials.yaml`；实测 `~/.dsh` 下另有 4 类影响行为的用户数据，文档一个都没提。

**证据**（实测 `C:\Users\Administrator\.dsh` 顶层：`.credentials.yaml`、`AGENTS.md`、`backups/`、`github-push/`、`profiles/`、`server-ssh/`、`sessions/`、`settings.yaml`、`storages/`）
| 遗漏项 | 实测 | 仓库内对应模板/说明 | 丢了会怎样 |
|---|---|---|---|
| `~/.dsh/AGENTS.md` | 存在，3977 B | 仓库有模板 `config/AGENTS-global-template.md`（2706 B，文件头写明「把本文件复制为新机的 `%USERPROFILE%\.dsh\AGENTS.md`，再把其中 `<盘符>` 全部替换」） | 全局指令不注入：D7 工具分工、DSH 服务纪律、重启 SOP、「本机环境事实」全部失效（本次会话注入的 `~/.dsh/AGENTS.md` 即该文件） |
| `~/.dsh/github-push/credentials.json` | 存在，355 B（另有 `state.json` 1393 B） | `ARCHITECTURE.md:71` 明列「GitHub PAT（`~/.dsh/github-push/credentials.json`）」，`DEPLOY.md` 无 | 推送插件无凭据，绑定 `dsh-ops` 的推送功能不可用 |
| `~/.dsh/server-ssh/state.json` | 存在，822 B | 无 | SSH 服务器面板为空（插件 `dsh-server-ssh` 在 profile bundles 里） |
| `~/.dsh/backups/` | 存在（含 20+ 个 `*-personal-hub` 备份） | `.gitignore:4` 排除 `backups/` | 新机无历史备份可回滚（reapply 每次都建新备份，属可接受，但文档应说明） |

`DEPLOY.md` 全文 grep `AGENTS|github-push|backups` 在「用户数据」语境下命中 0 处（仅 L119 出现插件名 `dsh-github-push`）。

**影响**：新机部署完成度只有「服务能跑」，AI 协作硬规则、推送凭据、SSH 面板三类行为与开发机不同。

**建议修法**：把 `DEPLOY.md` 第 3 步（L92-103）改成 4 项清单：① `settings.yaml`；② `.credentials.yaml`；③ `AGENTS.md`（复制 `config\AGENTS-global-template.md` 并替换 `<盘符>`）；④ `github-push\credentials.json`（+ 可选 `server-ssh\state.json`、说明 `backups/` 不入仓库）。

---

### I2. `config/settings.yaml` 模板与开发机真实配置差异巨大 —— 照模板配出来的不是同一套 DSH

**结论**：模板 139 行 / 7 个顶层键，开发机真实 `settings.yaml` 264 行 / 10 个顶层键；默认模型通道、模型 provider 清单、子代理模型分派策略、shell 超时、deepseek 模型目录全部不同。

**证据**（`config/settings.yaml` vs `C:\Users\Administrator\.dsh\settings.yaml`）
| 项 | 模板（仓库） | 开发机真实 |
|---|---|---|
| 顶层键 | `ui-onboarding / agent-default-model / agent-presets / permission / ui-theme / llm-pi-ai / ui-conversation` | 上述 7 个 + `shell` + `subagent-model-selection` + `llm-deepseek` |
| 默认模型 | `provider: opencode-go` / `model: deepseek-v4-flash` / `reasoningEffort: max` | `provider: opencode-live` / `model: deepseek-v4.1-flash` / `reasoningEffort: max` |
| `llm-pi-ai.providers` | `zai, opencode-go, opencode` | `unlimitds, bai, agnes, opencode, opencode-live-anthropic, opencode-live-responses, opencode-live` |
| 子代理分派 | **无该段** | `subagent-model-selection: {enabled: true, allowedModels: [agnes/agnes-3.0-flash, opencode-live/deepseek-v4.1-flash]}` |
| shell | **无** | `shell: {timeoutMs: 60000}` |
| deepseek 模型目录 | **无** | `llm-deepseek.models`（含 `deepseek-v4-flash / v4-pro / v4-flash-vision-exp / v4.1-flash-expires-on-0910` 等） |
| 凭据引用匹配 | 模板引用 `ZAI_API_KEY`（grep `apiKeyEnv` = `[OPENCODE_API_KEY, OPENCODE_GO_API_KEY, ZAI_API_KEY]`） | 真实 `[AGNES_API_KEY, BAI_API_KEY, OPENCODE_API_KEY, OPENCODE_GO_API_KEY, UNLIMITDS_API_KEY]`；`.credentials.yaml` 的 `refs` 实测只有 `DEEPSEEK/UNLIMITDS/BAI/AGNES/OPENCODE/OPENCODE_GO` 六个 —— **没有 `ZAI_API_KEY`** |

`DEPLOY.md:97` 的措辞仅为「从仓库拷贝 `config\settings.yaml` 模板，按本机修改（模型 provider / 语言 / 代理等）」。

**影响**：新机照模板走 → 默认对话模型变成 `opencode-go/deepseek-v4-flash`（开发机是 `opencode-live/deepseek-v4.1-flash`）；`~/.dsh/AGENTS.md` 里「子代理模型分派」那条硬规则（两个授权模型）在新机因为 `subagent-model-selection` 整段缺失而无从生效；模板里的 `zai` provider 因 `ZAI_API_KEY` 不存在而调用即 `MISSING_CREDENTIAL`。

**建议修法**：把模板升级为「开发机的最小可用超集」：补 `subagent-model-selection`、`shell.timeoutMs`、`llm-deepseek` 三段的说明性占位，并把 `llm-pi-ai.providers` 的示例改为与真实凭据 refs 对齐（删掉 `zai` 或注明需自备 `ZAI_API_KEY`）；同时 `DEPLOY.md:92-103` 明确「模板只是骨架，模型通道需按新机实际凭据重配，且 `subagent-model-selection` 必须显式配置才具备分派能力」。

---

### I3. 「自研插件 10 个 / 10 个 PASS / 10/10」全线过时：实际 12 个目录、11 个挂载、11 个 PASS

**结论**：文档出现 4 处「10」，实测数字是 **plugins/ 目录 12 个、profile bundles 里自研 11 个、validate-plugins 11 PASS（+2 SKIP）**。

**证据**
- 实测 `plugins/` 目录 12 个：`dsh-bug-log, dsh-computer-use, dsh-deepseek-balance, dsh-github-push, dsh-locale-language, dsh-opencode-session-id, dsh-personal-bar, dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume, dsh-server-ssh, dsh-tool-python`。
- 实测 `node validate-plugins.mjs`（exit 0）尾部：
  ```
  PASS dsh-locale-language / dsh-deepseek-balance / dsh-tool-python / dsh-bug-log / dsh-personal-hub /
       dsh-personal-bar / dsh-plugin-guide / dsh-restart-resume / dsh-server-ssh / dsh-github-push / dsh-computer-use
  SKIP @deepseek-ai/dsh-computer-use: disabled (not in dsh.profile.bundles)
  SKIP @deepseek-ai/dsh-experimental-computer-use-cua-driver-native: disabled (not in dsh.profile.bundles)
  validate-plugins: all 11 active linked plugin(s) safe to load
  ```
- 实测 `node check-plugin-copy.mjs`（exit 0）：`profile bundles: 15 · table entries: 17 / covered 13 · exempt 2 · missing 0`。
- 实测 profile bundles（`C:\Users\Administrator\.dsh\profiles\web\package.json`）15 条 = 官方 2（`dsh-base`、`dsh-web-app`）+ 自研 11 + 实验层 2（`dsh-experimental-agent-team-profile`、`dsh-experimental-agent-team-web-profile`）。
- 文档侧「10」出现在：`DEPLOY.md:10`（架构速览）、`DEPLOY.md:72`（bundles「官方 2 + 自研 10」，且漏掉实验层 2 条）、`DEPLOY.md:118`（「10 个 PASS」）、`bootstrap-personal.ps1:109`（「插件闸门应 10/10 通过」）。

**影响**：用户按文档验收会以为少了 1 个插件；`plugins/` 里那个多出来的 `dsh-opencode-session-id` 是弃用件（见 I4），文档未说明。

**建议修法**：四处同步改为「自研 11 个（plugins/ 目录另含 1 个已弃用的 dsh-opencode-session-id，不挂载）」；`DEPLOY.md:72` 补齐「+ 官方实验层 2（Agent Teams）」。

---

### I4. 验证清单要求确认输出含 `dsh-opencode-session-id` —— 该插件已弃用且不挂载，按文档验证会误判失败

**结论**：`DEPLOY.md:119` 让用户确认输出含 `dsh-opencode-session-id`，但该插件已弃用、不在 profile bundles、validate-plugins 也不输出它。

**证据**
- `plugins/dsh-opencode-session-id/package.json:4`：`"description": "（已弃用）为 opencode 路由注入 x-opencode-session 请求头，现由 harness 适配层的 harnessSessionHeader 取代"`。
- 实测 `node validate-plugins.mjs` 输出中无 `dsh-opencode-session-id`（11 条 PASS 列表见 I3）。
- 实测 profile bundles 中无 `dsh-opencode-session-id`（仅 node_modules 留有历史 link）。
- 该功能已由 `official-patches/apply-patches.mjs:52-117` 的 `harnessSessionHeader` 补丁链取代（`personal.json` 的 `web-search-deepseek` extraPatch `comment` 亦提到「Requires the official-patches session-header patch」）。

**影响**：新机验收第 3 条按字面执行会判定为「插件缺失」（假失败），诱发无谓排障。

**建议修法**：`DEPLOY.md:119` 删掉 `dsh-opencode-session-id`，改为「`dsh-server-ssh / dsh-github-push / dsh-personal-hub / dsh-deepseek-balance / dsh-tool-python / dsh-computer-use` 等 11 个」。

---

### I5. 「补丁 2 个」过时：`apply-patches.mjs` 实际 17 条精确替换 + 7 个文件恢复

**结论**：`ARCHITECTURE.md:39-43` 的补丁表只列 2 条、`DEPLOY.md:68` 写「2 个补丁」，实测 `patches[]` 有 **17 条**（覆盖 7 个文件），另有 `restore[]` **7 条**个人文件恢复。

**证据**（`official-patches/apply-patches.mjs`，250 行）
- `patches[]`（L21-170）逐条第 1 个字段 `file` 统计：`client/connection/src/rpc-host.ts`（L22-27）、`session/session-format-v0-to-v1/src/payload-validation.ts`（L28-33）、`web/web-search-deepseek/src/provider.ts`（L34-51）、`llm/llm-pi-ai/src/config.ts` ×2（L53-63）、`llm/llm-pi-ai/src/adapter.ts` ×3（L64-81）、`llm/llm-pi-ai/tests/adapter.spec.ts` ×2（L82-93）、`llm/llm-pi-ai/README.md` ×2（L94-105）、`llm/llm-pi-ai/README.zh.md` ×2（L106-117）、`client/ui-conversation/src/client/skeleton/InputBar.module.css`（L118-123）、`client/ui-plugin-manager/src/client/presentation.ts` ×2（L124-169）。
- 按主题归纳 5 类：① connection rpc 崩溃修复；② session descriptor v2 兼容；③ web_search 走 OpenCode 网关（`x-opencode-session` 头）；④ **llm-pi-ai `harnessSessionHeader` 路由 opt-in 链（11 条，任务假设的「第三个补丁」确证存在）**；⑤ 个人胶囊行 CSS（`flex-wrap`）+ 插件管理页中文名覆盖表（2 条）。
- `restore[]`（L194-230）7 条：`.agents/notes/...` ×3、`llm-pi-ai/README.i18n.yaml`、`docs/config-catalog.md/.zh.md/.i18n.yaml`；实测源文件全部存在（`official-patches/notes/` 7 个文件齐备，config-catalog.md 171090 B）。
- `ARCHITECTURE.md:42-43` 表格仅 2 行；`DEPLOY.md:68`「（2 个补丁：connection rpc 崩溃修复 + descriptor v2 兼容…）」。

**影响**：文档严重低估补丁面。新机部署本身不受影响（脚本按 `patches[]` 全量执行），但「官方升级导致补丁失效时需人工核对」的实际工作量是 7 个文件 17 处而非 2 处；`ARCHITECTURE.md` 作为架构文档失真。

**建议修法**：`ARCHITECTURE.md:39-46` 的表格扩成 5 行（按主题列 file 与原因），并注明「共 17 条精确替换 + 7 个个人文件恢复，见 `apply-patches.mjs`」；`DEPLOY.md:68` 改为「应用官方补丁（17 条精确替换 + 7 个文件恢复；目标文本唯一性校验，异常即 fail-loud）」。

---

### I6. 看门狗 G5 完全没进部署文档；本机靠「启动器成功路径」拉起，无开机自启

**结论**：`DEPLOY.md` 全文无 `watchdog/看门狗` 字样（架构速览 L7-19 也未列 `watchdog-dsh.ps1`，而 `ARCHITECTURE.md:17` 列了）；本机看门狗由 `start-dsh-web.ps1` 在服务就绪后拉起，另由 `health-check` 复活 —— 没有任何计划任务/注册表/服务级自启。

**证据（文档侧）**
- `DEPLOY.md` grep `watchdog|看门狗` → 0 命中；`ARCHITECTURE.md:16-17` 的 scripts 列表含 `/ watchdog-dsh.ps1 …`。
- `DEPLOY.md:113-123` 验证清单 6 条中无看门狗项（体检第 1 条会间接覆盖，但文档没说明）。

**证据（本机实际拉起方式，全部只读实测）**
- 计划任务：`(Get-ScheduledTask).Count` = 257，`Get-ScheduledTask | Where TaskPath -notlike '\Microsoft\*'` 共 10 项，**无一与 DSH/watchdog 相关**。
- 注册表自启：`Get-ItemProperty 'HKCU:\...\Run'` 8 项、`HKLM:\...\Run` 1 项，**无 DSH/watchdog 条目**。
- 启动文件夹：`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` 仅 `QuickLook.lnk`。
- Windows 服务：`Get-CimInstance Win32_Service | Where PathName -match 'watchdog|dsh-ops|DSH'` → 空。
- 进程实测：`PID 37544  pwsh.exe  "E:\GongJu\7\pwsh.exe" -NoProfile -ExecutionPolicy Bypass -File E:\DSH\DSH-ops\watchdog-dsh.ps1`，其 `ParentProcessId 30252` 已退出（脱离宿主的独立进程）。
- 拉起路径：`start-dsh-web.ps1:84-108` `Ensure-Watchdog`（`Start-Process -WindowStyle Hidden`，L104）在两处调用 —— `:161`（服务已在运行分支）与 `:210`（本次启动成功分支）；注释 L84-88 明确「启动器只在成功路径调用它」。
- 复活路径：`health-check.py:90-186`「看门狗 G5」段，L142 `fail("看门狗不在岗 ... — 自动复活")`、L180 `ok(f"看门狗已自动复活 pid ...")`。

**影响**：新机照文档跑 `start-dsh-web.ps1` 会**自动**获得看门狗（不是阻断项），但文档没写这层保护的存在、边界（只在启动成功路径挂载）与复活入口（`health-check.cmd`），用户在新机遇到「服务运行中但无运行期保护」时无从判断；「开机自启」在本机本来就不存在，故不是文档遗漏自启步骤，而是遗漏了机制描述。

**建议修法**：`DEPLOY.md` 架构速览（L7-19）补 `watchdog-dsh.ps1 运行期看门狗（由 start-dsh-web.ps1 成功路径拉起）`；验证清单（L115-123）加一行「看门狗在岗：`.\health-check.cmd` 的『看门狗 G5』段应显示 pid（不在岗会自动复活）」；「已知差异/边界」（L139-146）加一条「本机无开机自启：重启电脑后需手动启动服务，看门狗随启动器上岗」。

---

### I7. 「已知差异 / 边界」节未覆盖 4 类机器特定项

**结论**：`DEPLOY.md:139-146` 边界节列了 6 条，但机器特定项只提到「凭据不入仓库」与「provider 本机特有」；`extraDependencies` 绝对路径、`pythonPath`、`pwshPath`、端口 3080、看门狗均未在边界节出现。

**证据**
- `DEPLOY.md:139-146` 六条：补丁随官方升级失效 / 凭据密钥不入仓库 / 模型 provider / 演练隔离 / Node 版本 / 原生依赖。
- 缺 `extraDependencies`：`personal-hub/personal.local.json:24-27`（`link:E:/DSH/...` 绝对路径，注释自述「换机器时按本机副本路径重写」）—— 这是 B3 的根因，边界节却只字未提。
- 缺 `pythonPath`：`personal.local.json:9`（`C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe`）。
- 缺 `pwshPath`：`personal.local.json:19`（`E:\GongJu\7\pwsh.exe`）；profile 实测 `C:\Users\Administrator\.dsh\profiles\web\cordis.patch.yml` 文件头注释自己就写着「Paths below are pinned to THIS machine's actual interpreter locations (**DEPLOY.md template assumes standard install paths; this machine differs**)」。
- 缺端口：`DEPLOY.md:124` 只在第 4 步引用块里给了「隔离演练注意」，边界节无端口条目。
- 缺看门狗：见 I6。

**影响**：新机排障时缺一份「哪些值天生因机而异」的清单，最容易踩的正是 B3（extraDependencies）与 B1（python）。

**建议修法**：`DEPLOY.md:139-146` 追加 3-4 条：「`personal.local.json` 的 `extraDependencies`/`pythonPath`/`pwshPath` 均为本机绝对路径，新机必须按本机实际路径重写（`dsh-computer-use` 依赖 `extraDependencies` 两条 link，缺失会导致该 bundle 行解析失败）」；「端口 3080 为默认端口，与其它实例冲突时改 `settings.yaml` 的 webServer port」；「看门狗由启动器拉起，无开机自启」。

---

### I8. 第 5 步生成物描述与实际不符：文档暗示会有 `tool-python` 覆盖，脚本只生成 `pwsh-sandbox`

**结论**：`DEPLOY.md:70-74` 把 profile 装配的产物写成「`cordis.patch.yml` 托管条目（pwsh-sandbox / tool-python 等本机覆盖）」，但新机 bootstrap 生成的覆盖层里没有 `tool-python` 条目。

**证据**
- `DEPLOY.md:73`：`- \`cordis.patch.yml\` 托管条目（pwsh-sandbox / tool-python 等本机覆盖）`。
- `bootstrap-personal.ps1:80-85`：生成内容只有 `extraPatches = @(@{ id='pwsh-sandbox'; name='@deepseek-ai/dsh-pwsh-sandbox'; config=@{ pwshPath=$pwshPath } })`。
- `tool-python` 的覆盖来自 `personal.local.json:3-13`（`plugins[]` 里 `dsh-tool-python.patch.config.pythonPath`，实测 L9），即开发机自建层；新机该文件由脚本新建，天然没有这一段。
- 实测开发机 profile `cordis.patch.yml` 确有 `- id: tool-python … pythonPath: 'C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe'` 与 `- id: pwsh-sandbox … pwshPath: 'E:\GongJu\7\pwsh.exe'`。

**影响**：文档读者会以为新机 profile 自带解释器 pin；实际没有（配合 B1 就是「python 工具在新机只能靠内置定位链」）。

**建议修法**：`DEPLOY.md:73` 改为「`cordis.patch.yml` 托管条目（新机自动获得 `pwsh-sandbox` 的 pwshPath 覆盖；`tool-python` 的 pythonPath 需自行在 `personal.local.json` 配置）」。

---

### I9. 「代理自动诊断」与 bootstrap 实际行为不符

**结论**：`DEPLOY.md:66`（及 L34）称官方克隆「需要网络可达 GitHub，代理自动诊断」，但 `bootstrap-personal.ps1` 并不加载代理诊断库。

**证据**
- grep `lib-proxy` 全仓 .ps1 只有两处 dot-source：`update-dsh.ps1:10` 与 `check-update.ps1:7`；`bootstrap-personal.ps1` 无。
- `bootstrap-personal.ps1:42-43` 直接 `git clone --depth 1`，失败时 `throw '官方仓库克隆失败（VPN/代理需先就绪）'` —— 无诊断、无分级降级。
- `lib-proxy.ps1:1-2` 自述「被 check-update.ps1 / update-dsh.ps1 通过 dot-source 加载」。
- 实测无代理时 GitHub 不可达：`git ls-remote https://github.com/liaojiawei0428/dsh-ops.git HEAD` → `fatal: unable to access ...: Failed to connect to github.com port 443 after 21123 ms`，exit 128（说明文档强调「需要代理/VPN」是必要的 ✓，但「自动诊断」名不副实）。

**影响**：新机首次克隆失败时拿不到代理诊断信息，只能照 throw 文案自查。

**建议修法**：`DEPLOY.md:66` 改为「需要网络可达 GitHub（本机通常需代理/VPN；升级链 `update-dsh.ps1` 会自动做代理诊断，bootstrap 不会，克隆失败请先手动确认代理）」。

---

## 三、NIT（文档瑕疵）

| # | 结论 | 证据 | 建议 |
|---|---|---|---|
| N1 | 验收示例版本过时 | `DEPLOY.md:120`「与开发机一致（如 0.1.5-alpha.1）」；实测 `node apps\cli\lib\bin.js --version` → `0.1.6-alpha.2`（exit 0），`Deepseek_DSH/package.json` `version: 0.1.6-alpha.2` | 改为「如 0.1.6-alpha.2」或去掉版本号只留「与开发机一致」 |
| N2 | 未提 bootstrap 的 `-OfficialUrl` 参数 | `bootstrap-personal.ps1:25`（`[string]$OfficialUrl = 'https://github.com/deepseek-ai/deepseek-harness.git'`）；`DEPLOY.md:76-79` 只列 `-SkipInstall` / `-SkipProfile` | `DEPLOY.md:76-79` 的「可选项」补 `-OfficialUrl` |
| N3 | 「期望输出」示例与脚本实际措辞不同 | `DEPLOY.md:84`「DSH_HOME = ...（默认 %USERPROFILE%\.dsh）」 vs `bootstrap-personal.ps1:74`「DSH_HOME = $dshHome（个人 profile 装配到这里）」 | 按脚本原样更新示例 |
| N4 | 未提第 5 步还会初始化 profile 骨架 | `bootstrap-personal.ps1:91-98`（目录 + 最小 `package.json`，注释「reapply 的 validateManifest 要求它存在」）；`plugins/dsh-personal-hub/index.js:325-326` 校验 `profileDir/package.json` 存在 | `DEPLOY.md:70-74` 第 5 步加一句「必要时初始化 profile 骨架 package.json」 |
| N5 | 第 0 步 VS Build Tools 的举例（fs-ext）已过时，但结论成立 | `DEPLOY.md:33` 举例 fs-ext；实测 `Deepseek_DSH/pnpm-lock.yaml` 无 fs-ext 包（仅 `fs-extra@*` 命中），当前原生包 node-pty 自带 `prebuilds\win32-x64\conpty.node`（且 `scripts.install = "node scripts/prebuild.js \|\| node-gyp rebuild"`）、koffi 由 `@koromix/koffi-win32-x64` 提供 `koffi.node`（1042944 B）→ Windows x64 走预编译；`update-dsh.ps1:201-204` 仍称「官方 0.1.3-alpha.1 起 lockfile 含 fs-ext」 | 举例改为 `node-pty / koffi`，并注明「当前 Windows x64 走包内预编译；仅当官方引入需现场编译的原生依赖时才需 VS Build Tools」（脚本注释同步修） |
| N6 | `ARCHITECTURE.md` 全篇硬编码 `E:\DSH` 结构，与「新机盘符自由」并列时易误导 | `ARCHITECTURE.md:6-18` 树形图以 `E:\DSH\` 为根；`DEPLOY.md:36`「`<个人仓库根>` 可为任意目录（盘符自由）」 | `ARCHITECTURE.md:6` 顶部加注「本节以开发机 `E:\DSH` 为例，部署机盘符/父目录可不同（见 DEPLOY.md）」 |
| N7 | 第 1 步 clone 目录名写死 `ceshi`，与第 0 步「任意目录」表述并存 | `DEPLOY.md:46-48`（`git clone ... ceshi` / `cd ceshi`） vs `DEPLOY.md:36`（任意目录、盘符自由） | 建议把 `ceshi` 换成 `<个人仓库根>` 或注明「目录名可自取」 |
| N8 | 仓库可见性未能判定（网络受限） | 实测匿名 `git ls-remote` 因无代理失败（见 I9 证据），无法确认 `liaojiawei0428/dsh-ops` 是否公开；本机 `git remote -v` = `https://github.com/liaojiawei0428/dsh-ops.git`（与 `DEPLOY.md:47` 一致 ✓） | **待验证**：在无凭据机器/无缓存凭据环境执行 `git ls-remote https://github.com/liaojiawei0428/dsh-ops.git HEAD`；若报 404/认证失败，则 `DEPLOY.md` 第 0/1 步需补「仓库为私有，需先配置 GitHub 凭据（PAT）」 |

---

## 四、已核对无误的项（避免重复审核）

| 核对点 | 结论 | 证据 |
|---|---|---|
| 第 1 步 clone 地址 | 与真实 remote 一致 | `DEPLOY.md:47` = `https://github.com/liaojiawei0428/dsh-ops.git`；实测 `git remote -v` origin 同值，分支 `main` |
| Node 版本要求 | 与官方 engines 一致 | `DEPLOY.md:30`「^22.19 或 >=24」 vs `Deepseek_DSH/package.json` `engines.node = "^22.19.0 \|\| >=24.0.0"`；实测 `node -v` = v24.16.0 ✓ |
| pnpm 要求 | 与官方声明一致 | `DEPLOY.md:31`「11+」 vs `Deepseek_DSH/package.json` `packageManager = pnpm@11.7.0`；实测 `pnpm --version` = 11.22.0 ✓；`pnpm-workspace.yaml` 的 `patchedDependencies`（含 node-pty）与 `patches/` 3 个文件官方自带（与纯净 checkout `E:\DSH\Deepseek_DSH` 的 `pnpm-workspace.yaml` sha 相同：`4aa5f70b1c0be1e3`），新机 clone 后不会缺 patch 文件 |
| PowerShell 7 | 要求正确 | `DEPLOY.md:32`「必须装 7」；实测 `pwsh -v` = PowerShell 7.6.4 ✓；`start-dsh-web.ps1:70-82` 有 `DSH_PWSH_PATH → PATH → Program Files` 定位链 |
| bootstrap 5 步与文档一一对应 | 步骤数、顺序、参数一致 | `bootstrap-personal.ps1:39-103`（1 clone / 2 install / 3 patch / 4 build / 5 profile）vs `DEPLOY.md:66-74`；`$ErrorActionPreference='Stop'`（:29）+ 各步 `throw` 与 `DEPLOY.md:64`「任一步失败即中止」一致 |
| 隔离演练 DSH_HOME | 行为与文档一致 | `bootstrap-personal.ps1:73`（`$env:DSH_HOME` 优先，否则 `$USERPROFILE\.dsh`）vs `DEPLOY.md:38-39,51-54`；`plugins/dsh-personal-hub/index.js:236-241` 同语义派生 profileDir |
| profile 路径派生「盘符自由」 | 成立 | `plugins/dsh-personal-hub/index.js:236-248`（profileDir ← `$DSH_HOME`/`~/.dsh`；pluginsDir ← 本仓 `plugins`），`:566` 生成 `link:` |
| reapply 会自动 `pnpm install` 并复检 | 与文档一致 | `plugins/dsh-personal-hub/index.js:727`（`runPnpmInstall`）、`:738`（`复检无漂移`）；`reapply-cli.mjs:20-22` 输出 JSON 且 `ok` 决定退出码，与 `DEPLOY.md:74,86` 一致 |
| 补丁恢复源齐全 | 不会因缺文件 fail | `apply-patches.mjs:194-230` 的 7 个 `restore` 源在 `official-patches/notes/` 全部存在（实测 7/7 True） |
| 验证清单命令可用 | 路径与开关存在 | `health-check.cmd` 存在；`validate-plugins.mjs` / `check-plugin-copy.mjs` 实测 exit 0；`Deepseek_DSH\apps\cli\lib\bin.js` 存在（10974 B）且含 `dump-config`（5 次）、`--version` 实测输出 `0.1.6-alpha.2` |

---

## 五、待验证清单（给后续实证环节）

| # | 待验证问题 | 验证命令（新机/沙箱） |
|---|---|---|
| V1 | 新机 `pnpm install` 是否真的走 node-pty 包内 prebuilds、不触发 node-gyp（决定 VS Build Tools 是否真的可选） | 新机执行 `pnpm install --reporter append-only`，观察是否出现 `node-gyp rebuild`；或 `pnpm rebuild node-pty` 后检查是否生成 `build/Release/*.node` |
| V2 | 新机缺 `extraDependencies` 时启动是否如静态结论 `failed to import` 并被 G3 隔离 `dsh-computer-use`（B3） | C 层沙箱复现（task-3 实证项 2/3），或在沙箱 DSH_HOME 下跑 `node reapply-cli.mjs` 后检查 profile `dependencies` 与真实机基线 diff |
| V3 | `dsh-ops` 仓库可见性（私有则 clone 需认证） | `git ls-remote https://github.com/liaojiawei0428/dsh-ops.git HEAD`（无凭据环境） |
| V4 | 新机按模板 `settings.yaml` 启动后默认模型通道是否报 `MISSING_CREDENTIAL`（模板 `zai` 引用 `ZAI_API_KEY`） | 新机用模板 settings + 本机 `.credentials.yaml` 启动，触发一次模型调用并查 `dsh-web.err.log` |
| V5 | 新机无 Python 时 `health-check.cmd` 的确切退出码与输出 | 在沙箱 PATH 中去掉 python 后执行 `health-check.cmd`，记录 exit code（预期非 0，文案见 `health-check.ps1:74-79`） |

---

## 六、方法学与边界说明

- 本审核为**文档层**：所有结论来自只读文件读取、只读命令输出；未修改被审文件，未触碰 `~/.dsh`（仅列目录与读键名，未输出任何密钥值），未重启/停止任何 DSH 进程。
- 数字类结论均以实测命令原始输出为准（`validate-plugins.mjs` / `check-plugin-copy.mjs` / `bin.js --version` / `git remote -v` / `Get-ScheduledTask` / `Get-CimInstance Win32_Process`）。
- 与 B 层（脚本层，task-2）存在重叠的项（本文档不重复扫描）：`health-check.cmd:15`（`E:\GongJu\7\pwsh.exe` 回退）、`start-dsh-web.ps1:127/183/242`（`C:\Program Files\nodejs\node.exe` 硬编码）、`update-dsh.ps1:201-204` 的 fs-ext 注释 —— 本文档只在影响「文档—实际一致性」时引用，不重复做全量脚本扫描。
- 与 C 层（实证，task-3）的分工：B3/V2 的启动期后果、V1 的 prebuild 路径、V5 的体检退出码需沙箱实证，本文档给出的是代码级静态证据与验证命令。
