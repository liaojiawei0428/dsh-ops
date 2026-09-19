# DSH 新机部署兼容性审核报告（REPORT.md）

> 审核对象：`E:\DSH\DSH-ops` 的部署文档与部署链（DEPLOY.md / ARCHITECTURE.md / bootstrap-personal.ps1 /
> start-dsh-web.ps1 / update-dsh.ps1 / sync-official.ps1 / check-update.ps1 / watchdog-dsh.ps1 /
> reapply-cli.mjs / personal-hub 清单 / official-patches）。
> 目标问题：**能不能在另一台电脑部署出与开发机一样的 DSH？**
> 方式：团队模式（Lead + 4 名队友：文档层审核 / 脚本层扫描 / 隔离实证 / 对抗验证），Lead 汇总并修复。
> 日期：2026-09-19。

---

## 0. 一句话结论

**修复前不能。** 阻断点不在文档措辞，而在两件事：**① 仓库里有大量成果没进 GitHub**（新机 `git clone`
拿到的是 2026-09-09 的 `origin/main`，比开发机少 46 个文件，含两个插件整目录与整条补丁链）；
**② 部署链本身有 4 个真实缺陷**（覆盖层静默失效、平级官方 checkout 无人创建、node.exe 硬编码、python 定位链不一致）。

**修复后：脚本层已就绪。** 12 个文件已改并逐项验证（含隔离环境的端到端装配演练：
`dsh.profile.bundles` 15/15、`dependencies` 13/13 与开发机**完全一致**）。
**剩下最后一步只能由你做：把仓库提交并推送**（见 §5）——不做这一步，新机仍然部署不出同一套 DSH。

---

## 1. 审核怎么做的

| 角色 | 任务 | 产出 |
|---|---|---|
| audit-docs | 文档层：DEPLOY.md/ARCHITECTURE.md 与真实部署链一致性 | [docs-findings.md](docs-findings.md)（3 BLOCKER / 9 INCONSISTENT / 8 NIT） |
| audit-scripts | 脚本层：77 个文件的硬编码与移植性扫描 | [scripts-findings.md](scripts-findings.md)（608 行，含未命中记录） |
| verify-repro | 实证：隔离 DSH_HOME 复现新机装配、闸门真实数字、补丁语义 | [repro-findings.md](repro-findings.md)（6 项实证 + 沙箱原始产物） |
| crosscheck | 对抗验证：推翻错误结论、补漏、给最终分档 | [crosscheck.md](crosscheck.md)（19 条 BLOCKER；推翻/纠正 6 条他人结论） |
| Lead | 独立复核 + 修复 + 端到端验证 | 本报告 + 12 个文件的修复 |

对抗验证纠正了几条重要判定（记录在此以免被误用）：
- 「新机 clone 拿到 HEAD」**不成立**——`origin/main` 停在 `1adc2535cd`（09-09），本地还 `ahead 2`；差 46 个文件。
- `computer-use` 的 `failed to import` 在**新机不会发生**——`origin/main` 的清单里根本没这个插件（改判 INCONSISTENT）。
- 两个 `.bat` **已跟踪**（git quotepath 陷阱）；4 处 `powershell.exe` 全是 WMI 进程名匹配，**不是调用**，不违规。

---

## 2. 修复前的判定（19 条 BLOCKER）

### A 档 —— 阻断部署（4 条）

| 编号 | 问题 | 证据 |
|---|---|---|
| A0 | 新机的健康检查入口是裸 `python`，而自动定位真实 python 的包装器 + 两个 `.bat` 用户入口**都不在远端**（文档断链） | `origin/main` 版 DEPLOY.md:117 教 `python .\health-check.py`；`git ls-files` 无 `health-check.cmd` |
| A1 | 升级链要求平级 `<DSH-ops 父目录>\Deepseek_DSH`，**文档从未创建它** → `更新DSH.bat` 开箱即死 | update-dsh.ps1:8,18-21；sync-official.ps1:37,44；bootstrap 只 clone 仓库内部副本 |
| A2 | 补丁与「部署当天的官方 HEAD」时间耦合、无版本上界；失败时副本处于半打补丁态 | bootstrap `git clone --depth 1`（无 tag/commit 钉住）；apply-patches.mjs 无版本校验、写入非原子 |
| A3 | `C:\Program Files\nodejs\node.exe` 硬编码 4 处（含**服务本体**） | start-dsh-web.ps1:127,183,242；update-dsh.ps1:284 |

### B 档 —— 能部署但结果不一致（7 条）

最隐蔽的是 **B0**：`bootstrap-personal.ps1` 对同一哈希表连续调用两次 `ConvertTo-Json`，落盘成
「JSON 字符串字面量」→ 被 reapply 的 `typeof === 'object'` 守卫**整层静默忽略**（`pwsh-sandbox`、
`tool-python` 配置全丢），而 reapply 依然报 `ok: true`「复检无漂移」。

其余：B1 新机差 4 条 bundle、多 1 条；B2 补丁集只有 2/17；B3 `~/.dsh` 迁移面缺 4 项且全局指令模板
缺「子代理模型分派」整节；B4 首次启动开两个页面且裸地址 401；B5 settings 模板无法复现开发机行为；
B6 看门狗无任何持久化注册（计划任务/Run 键/服务三面皆空）。

### C 档 —— 文档瑕疵（8 条）

版本号过期（0.1.5 → 实际 0.1.6-alpha.2）、插件数口径（10 / 12 / 11 混用）、端口无字段名、
`__pycache__/*.pyc` 入库、4 个 `.ps1` 缺 UTF-8 BOM、`health-check.py` 忽略 `DSH_HOME`、
「2 个补丁」过时、DEPLOY.md 的重打补丁命令会踩非幂等。

---

## 3. Lead 已完成的修复（12 个文件，全部验证）

| # | 文件 | 改了什么 | 验证证据 |
|---|---|---|---|
| 1 | `bootstrap-personal.ps1` | 覆盖层只转一次 JSON；生成内容补齐 `pythonPath` 与 2 条 `extraDependencies`（指向本机副本，盘符自由）；新增**第 1b 步**克隆平级官方 checkout | 提取文件内真实代码段到沙箱执行 → 落盘可被 `json.loads` 解析为 dict，三项齐备；AST 语法 OK |
| 2 | `start-dsh-web.ps1` | 新增 `Resolve-NodePath`（`DSH_NODE_PATH` → PATH → Program Files ×2），替换 3 处硬编码；解析失败明确报错 | `Program Files\nodejs` 零命中；AST OK；BOM 已补 |
| 3 | `update-dsh.ps1` | 新增 `Resolve-NodePath` 并替换闸门；两处裸 `node` 改 `& $node`；平级官方 checkout 缺失时**自动 clone**；引入 `$dshHome` 尊重 `DSH_HOME`（5 处） | AST OK；BOM 已补；闸门 `validate-plugins` 11 PASS |
| 4 | `sync-official.ps1` | 官方 checkout 缺失时自动补 clone（非 `-ApplyPatchesOnly`） | AST OK；BOM 已补 |
| 5 | `check-update.ps1` | fetch 前先判目录存在性，缺失时打印准确路径与创建方法（不再误报「VPN 节点失效」） | AST OK；BOM 已补 |
| 6 | `watchdog-dsh.ps1` | 补 UTF-8 BOM（逻辑未动） | BOM 复查 YES |
| 7 | `health-check.py` | 尊重 `DSH_HOME`；**新增「机器覆盖层」自检段**（顶层非 object 即 exit 1，永久防 B0 类回归） | 实跑全绿：`结构正常（extraPatches 1 · extraDependencies 2 · plugins 覆盖 1）` |
| 8 | `plugins/dsh-tool-python/index.js` + `README.md` | 定位根补 `%LOCALAPPDATA%\Python`；目录过滤支持 `pythoncore-*` | 沙箱实跑命中 `…\pythoncore-3.14-64\python.exe`；闸门 11 PASS |
| 9 | `.gitignore` | 增 `__pycache__/`、`*.pyc` | — |
| 10 | `config/AGENTS-global-template.md` | 补回缺失的「子代理模型分派（个人偏好，硬规则）」整节（含两个机制坑） | 与开发机 `~/.dsh/AGENTS.md` 一致 |
| 11 | `DEPLOY.md` | 全文重写：两个 `Deepseek_DSH` 的分工、第 0 步补 Python 3、第 1b 步、第 3 步 5 类用户数据、验证清单修正（11 插件/15 bundle/0.1.6-alpha.2/看门狗）、已知差异 10 条、**附「交付前检查」含提交顺序** | 数字均取自实测 |
| 12 | 5 条 bug 记录 | `buglog/2026-09-19-*.md`（覆盖层、平级 checkout、node 硬编码、tool-python roots、DSH_HOME/BOM） | `bug_report` 已落库（227→231） |

### 端到端闭环证据（修复后的隔离演练）

在 `_sandbox/e2e`（隔离 `DSH_HOME` + 结构等同于 bootstrap 新逻辑生成的覆盖层）跑 `reapply-cli.mjs`：

```
{"ok": true, "actions": ["已备份 profile …", "package.json 已按清单重写", "cordis.patch.yml 托管条目已按清单重生成", "pnpm install 完成", "复检无漂移"]}   exit=0
```

与开发机 `~/.dsh/profiles/web` 对比：

| 维度 | 结果 |
|---|---|
| `dsh.profile.bundles` | 开发机 15 条 / 演练 15 条 —— **差集为空** |
| `dependencies` | 开发机 13 条 / 演练 13 条 —— **差集为空**（link 指向本机副本，盘符自由） |
| `cordis.patch.yml` 托管块 | `tool-python`(pythonPath)、`pwsh-sandbox`(pwshPath)、`deepseek-balance`、`plugin-guide`、`restart-resume`、`web-search-deepseek` 齐全 |
| 唯一残留差异 | 官方 Agent Teams 自管的非托管条目 `tool-agent-team`（低影响，已在 DEPLOY.md 说明） |

开发机整体体检：`health-check.cmd` → **HEALTH: 全绿**（服务 3080 / 看门狗在岗 / 15 bundles / 覆盖层 /
闸门 11 PASS / 回归 4 项 / 中文文案 missing 0），exit 0。

---

## 4. 修复后仍然存在、但不阻断部署的项（诚实清单）

| 项 | 现状 | 建议 |
|---|---|---|
| `apply-patches.mjs` 6 个 append 型补丁**非幂等** | 在已打补丁副本上重跑会重复插入（脚本仍报成功）——已在 DEPLOY.md 标注「只对纯净副本重跑」；buglog 已记（open） | 单独任务：改为「先全量试探、全部命中才统一写入」 |
| 补丁无版本上界校验 | 官方改动锚点时会 fail-loud 中止（安全方向），但需人工核对 | 可在 apply-patches 顶部加「版本未验证过」的**警告**（不阻断） |
| 看门狗无开机自启 | 只有 `start-dsh-web.ps1` 成功路径拉起；无计划任务/Run/服务 | 属机器行为变更，需你决定是否注册登录自启；文档已说明「重启电脑后要手动跑一次」 |
| `config/settings.yaml` 模板不完整 | 模板 3805 B vs 实机 7325 B（缺 `subagent-model-selection` 等） | 文档已改为「**推荐直接从旧机复制** `settings.yaml`（不含密钥）」 |
| `tool-agent-team` 非托管条目 | 新机首次启动由官方组件补写，reapply 不生成也不移除 | 低影响，已写进文档 |
| 新机端到端未在真机跑过 | 本机演练覆盖了装配层（profile 逐条一致），未覆盖 `git clone` 官方 + `pnpm install/build` 全流程 | 首次真机部署时按 DEPLOY.md 第 2、4 步走一遍即可 |

---

## 5. 必须由你完成的一步：提交并推送

`DSH-ops` 采用双轨流程（改动由你审阅后自行提交），所以这一步不能由 AI 代劳。**不做这一步，
本报告的全部修复对新机都不可见。**

```powershell
cd E:\DSH\DSH-ops
git status --porcelain                  # 看清单
git log origin/main..HEAD --oneline     # 有未推送提交也要处理
```

提交时的**顺序敏感点**（`crosscheck.md` §4 复核结论）：
1. `git add official-patches/notes/` —— **必须最先**：`apply-patches.mjs` 的 restore 段以它为唯一真相源，缺它会 exit 1
2. 再 `git add official-patches/apply-patches.mjs`
3. 再 `git add plugins/dsh-personal-bar plugins/dsh-computer-use personal-hub/personal.json plugins/dsh-personal-hub/index.js`
   （两个插件目录当前是**未跟踪**状态；漏掉它们，新机 profile 会少 4 条 bundle）
4. 部署链与闸门：`start-dsh-web.ps1 bootstrap-personal.ps1 update-dsh.ps1 sync-official.ps1 check-update.ps1 watchdog-dsh.ps1 health-check.py check-plugin-copy.mjs`
5. 本次修复 + 文档：`DEPLOY.md ARCHITECTURE.md .gitignore config/`
6. 清理入库的字节码：`git rm --cached __pycache__/health-check.cpython-*.pyc`
7. `git commit` → `git push`

完整清单与「不要提交什么」见 `DEPLOY.md` 末节「附：交付前检查」。

---

## 6. 产出文件索引

- 本报告：`research/deploy-audit/REPORT.md`
- 分路证据：[docs-findings.md](docs-findings.md) · [scripts-findings.md](scripts-findings.md) · [repro-findings.md](repro-findings.md) · [crosscheck.md](crosscheck.md)
- 沙箱复现物：`research/deploy-audit/_sandbox/`（覆盖层 harness、e2e 装配产物、补丁提取、pnpm shim 日志）
- 修复记录：`buglog/2026-09-19-bootstrap-overlay-double-json-encode.md` 等 5 条
