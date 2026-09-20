# DEPLOY.md 文档一致性审读（T2 · 文档审读者）

**审读对象**：`E:\DSH\DSH-ops\DEPLOY.md`（331 行，2026-09-19 版）
**审读方式**：完整精读全文；对文档引用的仓库文件（`config/`、`personal-hub/personal.json`、`official-patches/`、`*.ps1`/`*.mjs`/`*.bat` 文件名、profile 现状）逐一查证。
**隔离声明**：本报告**未阅读** `research/` 下任何其它报告（deploy-audit / deploy-sim 内的既有产物），未接触 `F:\ceshi_1`，未改动 `~/.dsh`（仅只读比对 settings.yaml 与 cordis.patch.yml），未触碰 3080 服务。
**审读时点**：开发机 `E:\DSH`，工作区 `main` 分支，官方 checkout 版本 `0.1.6-alpha.2`。

---

## 一、总体判定：**部分能**

判定要分两个场景，因为文档自身把"一致性"的达成条件押在了旧机身上：

| 场景 | 判定 | 依据 |
|---|---|---|
| **场景 A：迁移**（旧机在手边，可复制用户数据） | ✅ **能** | 第 0~2 步与第 4 步写得足够具体：命令可原样复制、成功判据可观察、失败路径多数给出；第 3 步的 5 类用户数据都能从旧机取到 |
| **场景 B：全新独立部署**（只有仓库，旧机不可用） | ⚠️ **部分能** | 服务能起来、插件能加载（第 2 步 + 第 4 步第 1~3 项可达成）；但"**与开发机一样**"做不到——文档第 138 行自己写明：仓库模板 settings.yaml **"照它配出来的不是同一套 DSH"**，且第 3 步 5 项用户数据中 4 项的唯一来源是"从旧机复制" |

**一句话结论**：这份文档是一份**优秀的迁移手册**，但**不是一份自足的复刻手册**。一个从没见过仓库的人可以照着它把 DSH 跑起来，但无法独立复刻出与开发机等价的部署——缺的那部分不是文档写得不好，而是它诚实地把"机器特定值"标成了外部输入（见第三节 A/B 类）。

---

## 二、逐步可执行清单表

「失败处理」列：**有** = 文档给出了失败时的处置路径；**部分** = 只提了现象没给处置；**无** = 未提及。

| # | 步骤（文档位置） | 在哪里执行 | 原样命令 | 前置条件 | 成功判据 | 失败处理 |
|---|---|---|---|---|---|---|
| 0 | 环境准备（L42–62，第 0 步） | 新机手工 | 无（安装 Git / Node ^22.19 或 >=24 / pnpm 11+ / PowerShell 7 / Python 3.12+ / 可选 VS Build Tools） | 有管理员权限、能装软件 | `git --version`、`node -v`、`pwsh -v`、`py -3 -V` 均可用 | **部分**：L93 说 bootstrap 会前置检查并给 winget 命令；但 python「只警告不拦」（L93），读者可能忽略直到验收第 1 项变红 |
| 0b | 隔离演练开关（L56–62） | 新机（仅演练） | `$env:DSH_HOME = '<隔离目录>'` | 无 | profile 装配到隔离目录 | **有**：L62 指明唯一约束是 3080 端口 |
| 1 | 交付前检查（L283–308，附） | **开发机** | `git status --porcelain`；`git log origin/main..HEAD --oneline`；L296–304 的一发判定脚本；`git ls-remote origin refs/heads/main` | 开发机能访问 GitHub（常需代理） | 两命令输出均为空；退出码 0 | **有**：L294 明确警告不要用 `git status` 的退出码 |
| 2 | 拉取个人仓库（L66–79，第 1 步） | 新机 `<root>` | `git clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops` | 网络可达 GitHub | 目录出现、`cd DSH-ops` 成功 | **部分**：未给克隆失败处置（私有库鉴权？网络？） |
| 3 | 一键部署（L83–128，第 2 步） | 新机 `DSH-ops` 内 | `pwsh -File .\bootstrap-personal.ps1` | 第 0、1 步完成；网络可达 GitHub | L116–128 的期望输出：`{ "ok": true, ... "复检无漂移" }` + `==== 部署完成 ====` | **有**：L89 「任一步失败即中止并说明原因」；L109–111 给出 `-SkipInstall`/`-SkipProfile` 退路 |
| 4 | 用户数据（L132–145，第 3 步） | 新机 `%DSH_HOME%` | 无命令（手工复制 5 类文件） | **旧机可访问** | 5 项就位 | **部分**：只说「从旧机复制」，未给校验方式（如段数/键名比对） |
| 5 | 启动（L149–153，第 4 步） | 新机 `DSH-ops` 内 | `pwsh -File .\start-dsh-web.ps1` | 第 3 步完成 | 服务起来、日志出现带 token 的地址 | **部分**：端口冲突有说明（L166–168），未给启动失败排查 |
| 6 | 验证 6 项（L155–168） | 新机 | 见第五节 | 服务在跑 | 6 项全过 | **部分**：仅第 1 项说明「看门狗不在岗会自动复活」 |
| 7 | 日常维护（L172–183） | 任意 | `更新DSH.bat` / `sync-official.ps1` / `reapply-cli.mjs` | — | — | **有**：L178 明确警告 apply-patches 只应对纯净副本重跑（8 个 append 型补丁不幂等） |
| 8 | 版本锚定（L187–242） | 新机默认无需操作 | `$env:DSH_OFFICIAL_REF = 'dsh-v0.1.6-alpha.2'`（仅临时换版时） | — | 克隆到锚点 tag | **有**：L214 警告不能填裸 SHA；L226–242 详述游离 HEAD 的处理 |

---

## 三、读者必须自己补的知识（分类清单）

> 每一项都满足「文档没写、但不补就做不下去」。

### A 类：凭据与密钥（**最硬的一类，无任何替代路径**）
文档第 136–142 行只写「从旧机复制」，但没列出**需要哪些 key**：
- `.credentials.yaml` 里到底需要哪几个 provider 的 Key（文档只说「API Key 等密钥」）；
- `github-push\credentials.json` 的 PAT 需要什么 scope；
- `OPENCODE_GO_API_KEY`（`personal-hub/personal.json` 的 `extraPatches` 里 `apiKeyEnv` 指向它，`cordis.patch.yml` 的 `web-search-deepseek` 段也用它）——**文档正文完全没提这个环境变量的存在**，但缺它 web_search 的 OpenCode 网关路由必然失败。
  - 位置：`personal-hub/personal.json` → `extraPatches[0].config.apiKeyEnv`；`~/.dsh/profiles/web/cordis.patch.yml` → `web-search-deepseek` 段。
  - 文档仅在 L138 笼统说「模型 provider 通道是本机特有的」（L258）。

### B 类：机器特定路径（文档给了机制，但读者需自行判断"不同是正常的"）
- 开发机的 pwsh 在**非标准位**：`E:\GongJu\7\pwsh.exe`（全局 AGENTS.md 也要求不硬编码该路径）；python 在 `C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe`。
- 后果：新机 `cordis.patch.yml` 的**托管条目值必然与开发机不同**（`pwsh-sandbox.pwshPath`、`tool-python.pythonPath`）。文档 L106、L251–255 解释了「由 bootstrap 自动生成」，但**第 4 步验证清单没有一句「这些路径不同属正常」**——读者若逐字对比两机 `cordis.patch.yml`，会误判为部署失败。
- 文档 L265–270 给了定位链与 `DSH_PWSH_PATH`/`DSH_PYTHON_PATH`/`DSH_NODE_PATH` 覆盖，但没说开发机本身就是非标准位（该信息只在 `cordis.patch.yml` 的注释里：`# Paths below are pinned to THIS machine's actual interpreter locations`）。

### C 类：网络与代理（**文档已知但未给值**）
- L52：bootstrap **不做**代理诊断（「克隆失败请先确认代理」）；L307–308：`ls-remote` 需手动 `git -c http.proxy=<系统代理>`。**`<系统代理>` 的具体值文档没有给，读者必须自己知道**——这是新机第一道门槛，卡在这里连第 1 步都过不去。
- L183 的补克隆、L241 「不需要下载约 287 MB 全量历史」都隐含网络可用。

### D 类：验证命令的隐藏前置
- 验证第 4 项（L162）`node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` 依赖**副本已构建**（`lib/bin.js` 是产物）；文档在第 2 步第 4 小步有构建，但验证清单没说「若跳过构建则此命令失败」。已核实该产物在本机存在。
- 验证第 6 项（L164）「个人胶囊行（SSH/推送/余额/版本）**可用**」——四个胶囊分别依赖 `dsh-server-ssh`/`dsh-github-push`/`dsh-deepseek-balance` 与对应的**凭据**（第 3 步第 4 项）。文档没把「胶囊可见」与「凭据已配」关联起来，读者可能以为胶囊不显示是插件没装上。

### E 类：隔离演练的边界（文档已写清，但读者易误读）
- L56–62 与 L259–262 两处都强调 `DSH_HOME` 被部署链/体检链**全部尊重**、「不必回避任何脚本」。这是**2026-09-19 起的现状**；若读者拿到的是更早的快照，需自行验证。
- L166–168：3080 端口全链硬编码（`start-dsh-web.ps1`/`watchdog-dsh.ps1`/`update-dsh.ps1`），**换端口必须同步改三处**——文档给了警告但**没给"改哪一行"的指路**。

### F 类：settings.yaml 的手工合并
- L138 明说模板是「最小骨架」，需读者自行补开发机的 `shell`（pwsh 超时）、`subagent-model-selection`（子代理授权模型清单）、`llm-deepseek`（模型目录覆盖）三个命名空间。
- **已核实**：模板 7 段确实缺这三段；开发机真实 settings.yaml 为 **264 行 / 10 段**（模板 165 行 / 7 段），差值 **99 行**。其中 `llm-pi-ai` 段模板**有**但短（模板 125 行 vs 开发机 215 行）——即「模型 provider 通道」并非完全没有，而是**部分缺失**（见第四节第 2 条）。

---

## 四、模糊 / 矛盾 / 与仓库实际不一致清单

| # | 位置 | 问题 | 查证结果 | 严重度 |
|---|---|---|---|---|
| 1 | L138 | 「仓库 `config\settings.yaml` 只是最小骨架（**139 行** / 7 个顶层段）」 | ✗ **行数不符**：实测 **165 行**；「7 个顶层段」✓ 正确 | 中（读者按 139 行核对会以为拿错文件） |
| 2 | L138 | 「**也不含**开发机的模型 provider 通道」 | ⚠️ **表述不精确**：模板**有** `llm-pi-ai` 段（125 行），开发机该段 215 行——是「部分缺失/内容更少」，不是「不含」。缺的是：`shell`(2行)、`llm-deepseek`(26行)、`subagent-model-selection`(7行) 三个**整段**，加上 `llm-pi-ai` 少的约 90 行 | 中 |
| 3 | L241 | 「（升级实测）……且仓库**始终保持 shallow**——不需要为升级下载约 287 MB 的全量历史」 | ⚠️ **与本机现状不符**：开发机平级 checkout `E:\DSH\Deepseek_DSH` 实测 `git rev-parse --is-shallow-repository` = **false**（非 shallow）。该断言针对**新机 `--depth 1` 克隆**，不是开发机现状；文档未区分这两者 | 中（读者对照开发机会误判） |
| 4 | L272–276 | 「新机通常由官方组件在首次运行时补写」`cordis.patch.yml` 里的 `tool-agent-team` 等非托管条目 | ⚠️ **未证实**：本机该条目**存在**（`~/.dsh/profiles/web/cordis.patch.yml` 末尾 `- id: tool-agent-team` / `disabled: false`），但「新机由官方组件补写」这一行为本次只读审查**无法验证** → 标**待确认** | 低（文档已给手工补齐的兜底） |
| 5 | L164 vs L106/L251–255 | 验证清单要求「页面……个人胶囊行与 Agent Teams 均可用」，但未说明 `cordis.patch.yml` 的 `pwshPath`/`pythonPath` 在新机**必然取不同值** | ⚠️ 已知差异（文档别处解释过），但**验证清单未交叉引用**，读者容易把「值不同」当成部署失败 | 中 |
| 6 | L51 vs L44–51 表格 | VS Build Tools 在依赖表里列出，说明却是「**仅当**官方更新引入原生依赖（如 fs-ext）时需要」——读者无法判断本次是否需要 | ⚠️ 模糊；L278–279 补了「缺则 pnpm install 报错，按提示安装」，算**部分闭环** | 低 |
| 7 | L70 vs L290/299/306 | clone URL 与分支名 | ✓ **一致**：`.git/HEAD` → `refs/heads/main`；remote = `https://github.com/liaojiawei0428/dsh-ops.git`，与 L70 完全一致 | — |
| 8 | L183 | 官方仓库 URL `https://github.com/deepseek-ai/deepseek-harness.git` | ✓ **一致**（平级 checkout 的 remote 之一即此） | — |

**未发现**的矛盾：架构速览（L14–38）对两个 `Deepseek_DSH` 的描述与实测一致（运行副本**无 `.git`** ✓ 对应 L222；平级那份**有 `.git`** ✓）；`.gitignore` 实际排除了 `Deepseek_DSH/`、`personal-hub/personal.local.json`、`__pycache__/`、`*.log`、`dsh-web.pid`、`backups/`、`node_modules/` ✓ 与 L328–329 的「不要提交」清单吻合。

---

## 五、文档对「一致性」给出的可验证断言（逐条抄原文 + 建议核对命令）

> 判定列：✓ = 本次已实测相符；✗ = 实测不符；⏳ = 本次未执行（需运行态，留给 T1 真机验证）。

| # | 位置 | 原文断言 | 建议核对命令 | 本次判定 |
|---|---|---|---|---|
| 1 | L104 | 「dependencies（**13 条** link：11 个自研插件 + 2 条官方 computer-use 包）」 | `node -e "const p=require(process.env.USERPROFILE+'/.dsh/profiles/web/package.json');const d=p.dependencies;console.log(Object.keys(d).length, Object.values(d).filter(v=>v.startsWith('link:')).length)"` | ✓ 13 / 13（本机 profile 实测） |
| 2 | L105 | 「bundles（**15 条** = 官方基座 2 + 自研 11 + 官方实验层 Agent Teams 2）」 | `node -e "console.log(require(process.env.USERPROFILE+'/.dsh/profiles/web/package.json').dsh.profile.bundles.length)"` | ✓ 15；且 `personal-hub/personal.json` = `officialBundles` 2 + `plugins` 11 + `extraBundles` 2 ✓ |
| 3 | L100 | 「当前 **24 条**精确文本替换 + **7 个**文件恢复」 | `node -e "const s=require('fs').readFileSync('official-patches/apply-patches.mjs','utf8');console.log('patches',(s.match(/^  \{/gm) ?? []).length)"`（更稳：解析 `patches`/`restore` 数组长度） | ✓ **24**（`patches` 数组）/ **7**（`restore` 数组）；`official-patches/notes/` 亦为 7 个文件 ✓ |
| 4 | L178 | 「其中 **8 个** append 型补丁不幂等」 | 解析 `apply-patches.mjs`：统计 `new` 完整包含 `old` 的条目 | ✓ **8 个**（#7/#9/#10/#12/#14/#17/#18/#23） |
| 5 | L160 | 「`node .\validate-plugins.mjs` → **11 个挂载插件全 PASS**（退出码 0）」 | `node .\validate-plugins.mjs; echo $LASTEXITCODE` | ✓ 11 个 active linked plugin 全 PASS、exit 0（本次实跑；输出含 2 条 disabled 的 SKIP） |
| 6 | L161 | 「`node .\check-plugin-copy.mjs` → **`missing 0`**」 | `node .\check-plugin-copy.mjs` | ✓ 输出确含 `covered 13 · exempt 2 · missing 0`，末行 `全部 bundle 均有中文名 OK`、exit 0 |
| 7 | L163 | 「`--version` → 与开发机一致（当前 **0.1.6-alpha.2**）」 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --version` | ✓ 静态一致：`Deepseek_DSH/package.json`、`apps/cli/package.json` 均为 `0.1.6-alpha.2` |
| 8 | L192/L198 | 「锚点声明在仓库里（`official-patches/official-ref.txt`）」+「首个非注释行」 | `node -e "console.log(require('fs').readFileSync('official-patches/official-ref.txt','utf8').split('\n').find(l=>l.trim()&&!l.startsWith('#')))"` | ✓ 文件存在，首个非注释行 = `dsh-v0.1.6-alpha.2` |
| 9 | L216–218 | 「开发机当前锚定值 = `dsh-v0.1.6-alpha.2`（平级官方 checkout 在 `master`、工作区干净、`git describe --tags --exact-match` 即该 tag；且该提交**同时就是** `origin/master` 当下的尖端）」 | `git -C ..\Deepseek_DSH rev-parse --abbrev-ref HEAD; git -C ..\Deepseek_DSH describe --tags --exact-match; git -C ..\Deepseek_DSH status --porcelain; git -C ..\Deepseek_DSH rev-parse HEAD origin/master` | ✓ **全部相符**：分支 `master`；tag `dsh-v0.1.6-alpha.2`；工作区干净；HEAD = origin/master = `ddefc45f…` |
| 10 | L222 | 「本机这份连自己的 `.git` 都没有」 | `Test-Path .\Deepseek_DSH\.git` | ✓ False（运行副本无 `.git`；平级那份有） |
| 11 | L138 | 「`config\settings.yaml` 只是最小骨架（**139 行** / 7 个顶层段）」 | `(Get-Content config\settings.yaml).Count`；`Select-String -Path config\settings.yaml -Pattern '^[A-Za-z_][\w-]*:'` | ✗ **行数不符（实测 165）**；段数 7 ✓ |
| 12 | L138 | 「**缺**开发机的 `shell`、`subagent-model-selection`、`llm-deepseek` 三个命名空间」 | 比对 `%USERPROFILE%\.dsh\settings.yaml` 与 `config\settings.yaml` 的顶层键集合 | ✓ **相符**（模板 7 段中确无这三个；开发机为 10 段） |
| 13 | L162 | 「15 条 bundle 全部出现，含 `dsh-server-ssh / dsh-github-push / dsh-personal-hub / dsh-deepseek-balance / dsh-tool-python / dsh-computer-use / dsh-personal-bar`」 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` | ⏳ 未执行（需运行 CLI；`lib/bin.js` 产物已确认存在） |
| 14 | L43/L47/L48/L49/L50 | 版本要求：Node `^22.19 或 >=24`、pnpm 11+、PowerShell 7.x、Python 3.12+ | `node -v; pnpm -v; pwsh -v; py -3 -V` | ✓ 开发机实测：Node `v24.16.0`、pnpm `11.22.0`、pwsh `7.6.4`、Python `3.14.6`、git `2.47.1` —— 全部满足 |
| 15 | L164 | 「个人胶囊行（SSH/推送/余额/版本）与 Agent Teams 均可用」 | 浏览器打开带 token 地址 | ⏳ 未执行（需运行态 + 凭据） |
| 16 | L241 | 「仓库始终保持 shallow」 | `git -C ..\Deepseek_DSH rev-parse --is-shallow-repository` | ✗ **本机为 false**（非 shallow）——见第四节第 3 条 |

---

## 六、给 Lead 的收敛结论（最严重的 3 条）

1. **一致性无法独立达成（L132–145 第 3 步 + L138）**——5 类用户数据中 4 类只能「从旧机复制」，且文档自认模板 settings.yaml「照它配出来的不是同一套 DSH」。全新机器上，第 4 步验证第 5/6 项（版本一致可过、页面胶囊与模型调用需凭据）必然受阻。**这是"能不能部署出与开发机一样的 DSH"的决定性缺口，且无文档内解法。**
2. **L138 的具体数字错误**：称 `config\settings.yaml` 为「139 行」，实测 **165 行**（段数 7 正确）。另有隐含遗漏：正文**从未提及 `OPENCODE_GO_API_KEY`**，而它是 `personal.json` 的 `extraPatches` 与 `cordis.patch.yml` 的 `web-search-deepseek` 段的必需环境变量。
3. **L241 「仓库始终保持 shallow」与开发机实测（non-shallow）冲突**，叠加 **L164 验证清单未说明「新机 `cordis.patch.yml` 的 pwshPath/pythonPath 必然不同」**——两处都会让读者拿开发机与新技术逐字比对时误判部署失败。

**建议的最小修订**（供 Lead 取舍）：① L138 的行数改为 165，并把「不含模型 provider 通道」改为「`llm-pi-ai` 段内容更少（模板 125 行 vs 开发机 215 行）且缺 `shell`/`llm-deepseek`/`subagent-model-selection` 三段」；② 第 3 步补一张「必需凭据清单」（含 `OPENCODE_GO_API_KEY`）与获取方式；③ L241 注明该 shallow 断言仅适用于新机 `--depth 1` 克隆；④ 第 4 步验证清单加一句「`cordis.patch.yml` 中的 pwshPath/pythonPath 因机而异，值不同属正常」。
