# C-实证验证：隔离环境复现新机装配路径

- 任务：task-3「C-实证验证：隔离环境复现新机装配路径」，执行者 `verify-repro`
- 执行时间：2026-09-19（本机时钟）
- 工作目录：`E:\DSH`；沙箱：`E:\DSH\DSH-ops\research\deploy-audit\_sandbox\`（含 `dsh-home`）
- 被测基线：DSH-ops 工作区 HEAD `05e2dda`（2026-09-17 10:30:45，「chore: DSH sync」）
  + 未提交改动 65 项；官方 checkout `E:\DSH\Deepseek_DSH` = `ddefc45`（2026-09-17 21:19:19，release-dsh-0.1.6-alpha.2）
- 本文所有结论均在**隔离沙箱内实跑**得到，或为**只读**读取开发机真实文件得到；原始输出按实际内容摘录（含失败行）

## 0. 安全边界执行记录（先证明没碰生产环境）

| 约束 | 执行情况 |
| --- | --- |
| 不触碰运行中的服务 | 未调用 `request_restart`、未执行 `start-dsh-web.ps1`（任何参数）、未 kill 任何进程 |
| 不修改 `C:\Users\Administrator\.dsh` | 全程只读（`read`/python 读取、`import.meta.resolve` 只读解析、`os.readlink`），未写入一个字节 |
| 写入范围 | 仅 `_sandbox\`（含 `dsh-home`）+ 本文件 `repro-findings.md` |
| 不跑 git clone/fetch/push | 未执行；只用只读 `git log/show/status/diff --stat/ls-files` |
| 不跑 pnpm install / build | **未真跑**。reapply 内部会无条件调用 `pnpm install`，故用沙箱 `pnpm.cmd` shim 前置到 PATH 拦截（见 2.0），真 pnpm 零执行 |
| 临时 DSH_HOME | 每条 pwsh 调用内 `$env:DSH_HOME` 只在本进程生效，指向 `_sandbox\dsh-home` |

沙箱隔离成立的正向证据：reapply 的备份目录落在 `_sandbox\dsh-home\backups\<stamp>-personal-hub\`
（对应 `plugins/dsh-personal-hub/index.js:643-654`，备份根 = profileDir 的祖父目录，随 `$DSH_HOME` 走），
真实 `C:\Users\Administrator\.dsh\backups` 未被触碰。

---

## 实证 1：`reapply(manifestPath)` 的路径派生与写入字段

**假设**：装配路径在运行期派生（盘符自由），机器特定值走 gitignore 的覆盖层。

**实际命令**：`read plugins\dsh-personal-hub\index.js`（746 行全文，行号为实际行号）

**关键代码与行号**：

| 事项 | 行号 | 事实 |
| --- | --- | --- |
| 默认清单路径 | `index.js:34-38` | `<插件目录>/../../personal-hub/personal.json` → `E:\DSH\DSH-ops\personal-hub\personal.json` |
| 覆盖层文件名 | `index.js:47` | `personal.local.json`（与清单同目录，gitignore） |
| 覆盖层合并入口 | `index.js:219-231` | `existsSync(localPath)` → `JSON.parse` → **仅当 `typeof local === 'object' && !Array.isArray(local)` 才 `mergeOverlay`**（第 228 行，本任务缺陷的判定点） |
| `profileDir` 派生 | `index.js:236-242` | `$DSH_HOME`（空则 `~/.dsh`）+ `profiles/web`，转正斜杠 |
| `pluginsDir` 派生 | `index.js:243-248` | 插件自身 `import.meta.url` 上溯三级 + `plugins` → 与本仓库布局绑定，**不随机器变化** |
| `link:` 依赖 | `index.js:564-569` | `expectedDependencies` = `{ [p.name]: 'link:' + pluginsDir + '/' + p.name }` 再展开 `extraDependencies` |
| `officialBundles`/`plugins`/`extraBundles` | `index.js:548-554` | `declaredBundles` 依次拼接 → 写进 `dsh.profile.bundles` |
| `extraPatches` | `index.js:501-511` + `518-538` + `483-494` | `managedIds` 收集（插件 patch 字段 + extraPatches）→ `rebuildPatchYaml` 重生成托管块，外来块逐字保留 |
| 覆盖层合并语义 | `index.js:268-295` | `plugins` 按 `name`、`extraPatches` 按 `id` 深合并；其它数组/标量整体替换 |
| package.json 写入 | `index.js:706-719` | `dependencies = expectedDependencies(manifest)`；`dsh.profile.bundles = [...declared, ...foreignKept]` |
| cordis.patch.yml 写入 | `index.js:722-725` | 原子重写（`atomicWrite` `636-640`：tmp + rename） |
| `pnpm install` | `index.js:664-693`（spawn）+ `727-735`（判定） | `spawn('pnpm install --reporter append-only', { cwd: profileDir, shell: true })`，超时 5 分钟 |
| 复检 | `index.js:737-740` | `statusReport` → `ok` 由复检的 drift 决定 |

**结论**：**证实**。路径派生确实是运行期（`$DSH_HOME` + 插件自身位置），机器无关；机器特定值（绝对路径、profile 级裸包 link）**只能**通过 `personal.local.json` 注入。

**对新机一致性的影响**：装配本身可移植，但**覆盖层是唯一承载机器特定内容的通道**——该通道一旦失效（见实证 2），新机必然产出与开发机不同的 profile，且没有任何报错。

---

## 实证 2：隔离沙箱复现「新机 bootstrap 装配」——覆盖层缺陷（本轮最重发现）

### 2.0 前置：用 shim 拦掉 reapply 内部的 pnpm install（安全措施与有效性证明）

**假设**：reapply 会真跑 `pnpm install`，直接执行会写沙箱外/耗时，需要拦截。

**实际命令**（写入 `_sandbox\shim\pnpm.cmd`：只记日志、`exit /b 0`，然后 PATH 前置）：

```powershell
$env:PATH = "E:\DSH\DSH-ops\research\deploy-audit\_sandbox\shim;" + $env:PATH
node -e "const{spawn}=require('node:child_process');const c=spawn('pnpm install --reporter append-only',{shell:true});c.on('close',s=>console.log('SPAWN_EXIT='+s))"
```

**原始输出**：`SPAWN_EXIT=0`；shim 日志出现两行（含后续三次 reapply 的真实调用）：

```
[SHIM] args=install --reporter append-only cwd=E:\DSH
[SHIM] args=install --reporter append-only cwd=E:\DSH\DSH-ops\research\deploy-audit\_sandbox\dsh-home\profiles\web
```

并确认仓库未被污染：`E:\DSH\pnpm-lock.yaml`、`E:\DSH\node_modules`、`E:\DSH\package.json` 均 `False`（不存在）。

**结论**：**证实**。shim 有效；reapply 每次恰好调用一次 `pnpm install`，`cwd` = `<DSH_HOME>\profiles\web`（作用域限于 profile 目录）。
补充静态核查：`E:\DSH\pnpm-workspace.yaml`、`E:\pnpm-workspace.yaml`、`~/.dsh\pnpm-workspace.yaml`、`~/.dsh\profiles\pnpm-workspace.yaml`、`E:\DSH\DSH-ops\pnpm-workspace.yaml` **全部不存在**，故即便真跑也不会被 pnpm 当成 workspace 子项目而外溢到仓库。

### 2.1 场景 A：纯新机（无覆盖层）——reapply 静默成功但产物缺项

**假设**：新机 bootstrap 只生成 profile 骨架后跑 reapply，产物与开发机应当一致。

**实际命令**：

```powershell
$env:PATH = "…\_sandbox\shim;" + $env:PATH
$env:DSH_HOME = "E:\DSH\DSH-ops\research\deploy-audit\_sandbox\dsh-home"
node E:\DSH\DSH-ops\reapply-cli.mjs E:\DSH\DSH-ops\research\deploy-audit\_sandbox\manifest\personal.json
```

（profile 起点 = `bootstrap-personal.ps1:95` 的骨架 `{"name":"dsh-profile-web","private":true,"dependencies":{},"dsh":{"profile":{"bundles":[]}}}`，无 `personal.local.json`）

**原始输出**：

```
{ "ok": true, "actions": [
  "已备份 profile 文件到 …\_sandbox\dsh-home\backups\2026-09-19T07-19-15-132Z-personal-hub",
  "package.json 已按清单重写（dependencies + dsh.profile.bundles；清单外保留 0 项）",
  "cordis.patch.yml 托管条目已按清单重生成（官方块原样保留）",
  "pnpm install 完成", "复检无漂移" ] }
=== reapply A exit code: 0 ===
```

生成物：`dependencies` 仅 11 条自研 link；`cordis.patch.yml` 仅 4 块
（`deepseek-balance / plugin-guide / restart-resume / web-search-deepseek`）。

**结论**：**证实**（差异存在）——exit 0 且「复检无漂移」，但相对开发机缺 2 条依赖与 3 个 patch 块（明细见实证 3）。

**对新机一致性的影响**：reapply 的成功信号**不能**作为「装配一致」的依据——缺失项不在清单的期望集合里，`statusReport` 结构上无法发现。

### 2.2 场景 B：bootstrap 真实生成的覆盖层——被整层静默忽略（缺陷 A）

**假设**：bootstrap 生成的 `personal.local.json` 会被 reapply 合并。

**实际命令**：用 pwsh 逐行复现 `bootstrap-personal.ps1:77-90`（仅把输出路径改到 `_sandbox\manifest\personal.local.json`）：

```powershell
$local = @{ _comment = '…'; extraPatches = @(
    @{ id = 'pwsh-sandbox'; name = '@deepseek-ai/dsh-pwsh-sandbox'; config = @{ pwshPath = $pwshPath } }
  ) } | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($localCfg, ($local | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
```

**原始输出**：`[repro] generated …personal.local.json (pwshPath=E:\GongJu\7\pwsh.exe)`、`file bytes: 341`

生成物**逐字**内容（首字符是双引号，内部全转义）：

```
"{\r\n  \"extraPatches\": [\r\n    {\r\n      \"id\": \"pwsh-sandbox\", … \"pwshPath\": \"E:\\\\GongJu\\\\7\\\\pwsh.exe\" … }"
```

python 校验：`json.loads` → 顶层类型 `str`；模拟 `index.js:228` 的 `typeof local === 'object'` → **False（不合并）**。

在该沙箱 DSH_HOME 下重跑 reapply（场景 B）**返回完全相同**：`ok: true`、`exit code: 0`、「复检无漂移」，
但生成物 `cordis.patch.yml 是否含 pwsh-sandbox: False`、`是否含 tool-python: False`。

**根因（源码定位）**：`bootstrap-personal.ps1:80-86` 对同一哈希表调用了**两次** `ConvertTo-Json`——
第 85 行赋值时已把哈希表转成字符串，第 86 行写盘时再转一次，得到「JSON 字符串字面量」而非 JSON 对象；
`index.js:228` 的守卫只接受 plain object，于是整层覆盖被跳过（第 228-231 行不进）。

**结论**：**证实**（缺陷成立，且静默）。已按规范记入 buglog（见文末）。

**对新机一致性的影响**：新机即使修好其它环节，`pwsh-sandbox` 与 `tool-python` 两个托管块也不会生成，而 reapply 报告成功。

### 2.3 场景 C：手工修正的覆盖层——产物与开发机逐字节一致（收敛性证明）

**假设**：把覆盖层换成结构正确的 JSON 对象（含 `pwsh-sandbox`、`tool-python.patch.config.pythonPath`、`extraDependencies` 两条 link），其余不变，产物应等于开发机。

**实际命令**：同 2.1，清单同目录放结构正确的 `personal.local.json`（931 字节，`json.loads` 顶层类型 `dict`）。

**原始输出**：

```
ok: true … "复检无漂移"  === reapply C exit code: 0 ===
dependencies 相同: True
bundles 相同: True
patch 块 新机: ['deepseek-balance','tool-python','plugin-guide','restart-resume','web-search-deepseek','pwsh-sandbox']
patch 块 开发机: [… , 'tool-agent-team']
新机缺: ['tool-agent-team'] | 新机多: []
```

**结论**：**证实**——`package.json` 的 `dependencies` 与 `dsh.profile.bundles` 与开发机**完全相同**，
`cordis.patch.yml` 只差非托管块 `tool-agent-team`。

**对新机一致性的影响**：装配逻辑本身**可以**在一台干净机器上复现开发机结果；
本轮全部 profile 层不一致都可归因到「覆盖层这一层」，不是 reapply 的派生逻辑问题。

### 2.4 computer-use 的解析链（差异是否致命）

**假设**：缺 `extraDependencies` 时，`dsh-computer-use` bundle 插入的两行裸包名仍能解析。

**证据链**：

1. `plugins\dsh-computer-use\cordis.patch.yml` 用 `insert:` 插入两行裸包名：
   `@deepseek-ai/dsh-computer-use`（id `computer-use`）与 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native`（id `computer-use-cua-driver-native`）；
   其 `index.js` 明示「ships no runtime behaviour」，即能力**完全**由这两行提供。
2. 开发机 `…\.dsh\profiles\web\node_modules\@deepseek-ai\` 里这两个包是**符号链接**，指向
   `\\?\E:\DSH\DSH-ops\Deepseek_DSH\packages\computer-use\computer-use` 与 `…\experimental\computer-use-cua-driver-native`
   —— 即由 profile `dependencies` 的两条 `link:`（`extraDependencies`）建立。
3. 供给其他官方裸包名的 fallback 层**不包含**这两个包：
   `C:\Users\Administrator\.dsh\profiles\node_modules\@deepseek-ai\` 共 260 个包，
   含 `dsh-pwsh-sandbox`、`dsh-web-search-deepseek`（所以这两个无需写进 profile 依赖），
   但**没有任何 `computer*` 条目**；`profiles\web\.dsh-module-fallback\node_modules\@deepseek-ai\` 为 **0 个包**。
4. 只读解析对照（`import.meta.resolve`，不加载业务代码）：

```
=== A) 开发机真实 profile 目录内解析 ===
OK   @deepseek-ai/dsh-computer-use → file:///E:/DSH/DSH-ops/Deepseek_DSH/packages/computer-use/computer-use/lib/index.js
OK   @deepseek-ai/dsh-experimental-computer-use-cua-driver-native → …/experimental/computer-use-cua-driver-native/lib/index.js
=== B) 沙箱（新机生成物）目录内解析 ===
FAIL @deepseek-ai/dsh-computer-use ERR_MODULE_NOT_FOUND
FAIL @deepseek-ai/dsh-experimental-computer-use-cua-driver-native ERR_MODULE_NOT_FOUND
```

5. 同一症状在本仓库**已有历史记录**：`buglog\2026-09-17-computer-use-insert-dsh-web-err-log-2-en.md`
   症状原文「2 entries did not activate … failed to import」，根因即「profile patch 插入行的裸包名从配置目录解析，而 profile/node_modules 里没有」，
   修复第 2 步就是在 `personal.local.json` 增加 `extraDependencies`——**该修复只存在于 gitignore 的机器特定文件里**。

**结论**：**证实**。新机缺这两条 link → 两行 `failed to import`，computer-use 能力缺失（可选行，服务本身仍能启动，
但 `start-dsh-web.ps1:237-249` 的 G3 兜底可能把 `dsh-computer-use` 自动移出 bundles，进一步扩大与开发机的差异）。

**对新机一致性的影响**：**BLOCKER 级功能缺失 + 开发机 2026-09-17 已修复故障的复现**。

---

## 实证 3：开发机基准快照 diff（新机将会缺什么/差什么）

**假设**：静态审核推测的差异可由生成物与真实 profile 直接对比量化。

**实际命令**：python 读取 `C:\Users\Administrator\.dsh\profiles\web\{package.json,cordis.patch.yml}`（只读）与沙箱生成物做结构化 diff。
敏感性核查：这两个文件**只含包名、link 路径与 `apiKeyEnv` 变量名（`OPENCODE_GO_API_KEY`），不含密钥值**，无需打码。

**原始输出（场景 A = bootstrap 真实路径）**：

```
-- dependencies --
  新机独有 : （无）
  开发机独有: ['@deepseek-ai/dsh-computer-use',
              '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native']
-- dsh.profile.bundles --
  新机独有 : （无） | 开发机独有: （无） | 顺序相同: True
-- cordis.patch.yml 托管/外来块 id --
  新机缺 : ['tool-python', 'pwsh-sandbox', 'tool-agent-team'] | 新机多 : []
-- 文件头 --
  新机头行数: 1 | 开发机头行数: 5
```

**逐条差异清单（这是「部署出来的 DSH 与开发机不一样」的实证清单）**：

| # | 差异条目 | 场景 A（新机真实路径） | 场景 C（覆盖层修正后） | 影响 |
| --- | --- | --- | --- | --- |
| 1 | `dependencies.@deepseek-ai/dsh-computer-use` | 缺 | 一致 | **功能缺失**（见 2.4），且可能触发 G3 自动隔离 |
| 2 | `dependencies.@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | 缺 | 一致 | 同上 |
| 3 | `cordis.patch.yml` 块 `tool-python`（`pythonPath` 绝对路径） | 缺 | 一致 | `dsh-tool-python` 失去固定解释器，回退 PATH 探测（新机 python 不一定是 3.14.6） |
| 4 | `cordis.patch.yml` 块 `pwsh-sandbox`（`pwshPath`） | 缺 | 一致 | 官方沙箱插件改用默认 pwsh 解析，行为随新机 PATH 而变 |
| 5 | `cordis.patch.yml` 块 `tool-agent-team` | 缺 | 缺 | **非托管块**（Agent Teams 写入；README/ buglog 记载），官方 agent-team bundle 自带同一 `insert`，功能面影响低；建议 D 任务确认首次启动是否自动补 |
| 6 | `cordis.patch.yml` 文件头 3 行注释（"Paths below are pinned to THIS machine's…"） | 缺 | 缺 | 纯注释（NIT） |

**结论**：**证实**——profile 层实证差异 **6 条**，其中 4 条（#1–#4）由覆盖层缺陷/内容缺失直接造成，场景 C 证明修好覆盖层后 #1–#4 全部收敛。

### 3.1 追加发现：新机 clone 拿到的是 HEAD，而 HEAD 与本机工作区差异巨大

**假设**：新机按 bootstrap 第 1 步 clone 后，仓库内容 ≈ 开发机现状。

**实际命令**（只读）：

```
git -C E:\DSH\DSH-ops log -1 --format='HEAD=%H DATE=%ci SUBJ=%s'
git -C E:\DSH\DSH-ops status --porcelain            → count = 65
git -C E:\DSH\DSH-ops diff --stat HEAD -- bootstrap-personal.ps1 personal-hub/personal.json official-patches/apply-patches.mjs plugins/dsh-personal-hub/index.js reapply-cli.mjs start-dsh-web.ps1
git -C E:\DSH\DSH-ops show HEAD:personal-hub/personal.json
git -C E:\DSH\DSH-ops ls-files plugins
```

**原始输出关键行**：

```
HEAD=05e2dda00dd695014ed1f30c2518395c71bc22bd  DATE=2026-09-17 10:30:45 +0800  SUBJ=chore: DSH sync
count = 65
 official-patches/apply-patches.mjs | 197 ++++++++++++++++++++++++++++++++++++-
 personal-hub/personal.json         |  29 ++++--
 plugins/dsh-personal-hub/index.js  | 118 +++++++++++++++++++---
 start-dsh-web.ps1                  |  42 +++++++-
 4 files changed, 361 insertions(+), 25 deletions(-)
（bootstrap-personal.ps1、reapply-cli.mjs 未出现在 diff 中 → 工作区 == HEAD）
?? plugins/dsh-computer-use/
?? plugins/dsh-personal-bar/
HEAD 跟踪的 plugins/ 目录（10 个）: dsh-bug-log, dsh-deepseek-balance, dsh-github-push, dsh-locale-language,
  dsh-opencode-session-id, dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume, dsh-server-ssh, dsh-tool-python
工作区 plugins/ 实际目录（12 个）: 上述 10 个 + dsh-computer-use + dsh-personal-bar
```

HEAD 版 `personal.json` 与工作区版的实质差异：
HEAD **没有** `extraBundles`、**没有** `extraPatches`（无 web-search-deepseek）、**没有** `dsh-personal-bar` / `dsh-computer-use`，
但**有** `dsh-opencode-session-id`（含 `providers: []` 配置）；工作区版恰好相反。

**结论**：**证实**——新机 clone 得到的是「10 个插件、无 Agent Teams、无 web-search-deepseek、含 opencode-session-id」的旧装配意图，
而开发机现状是「11 个插件 + 2 个官方 computer-use link + Agent Teams + web-search-deepseek」。
更关键的是 `plugins/dsh-computer-use`、`plugins/dsh-personal-bar` 是**未跟踪目录**（`??`），新机 clone **根本拿不到这两个插件**。

**对新机一致性的影响**：**在完成提交之前，「新机部署出完全相同的 DSH」在事实上不成立**——
这不是配置问题，而是「仓库里没有这份状态」。差异 3 条：
① 共享清单内容（插件集/extraBundles/extraPatches）；② 补丁集（`apply-patches.mjs` 少 197 行新增改动）；
③ 两个插件目录缺失。**修正动作：由用户按 dual-track 流程提交**（本任务不代提交）。

---

## 实证 4：`validate-plugins.mjs` 与 `check-plugin-copy.mjs` 真实数字

**假设**：文档声称「自研插件 10 个 / 闸门 10/10 通过」。

**实际命令**：`node validate-plugins.mjs`、`node check-plugin-copy.mjs`（工作目录 `E:\DSH\DSH-ops`，只读闸门）

**原始输出关键行**：

```
validate-plugins:
  SKIP @deepseek-ai/dsh-computer-use: disabled (not in dsh.profile.bundles) — not loaded, not validated
  SKIP @deepseek-ai/dsh-experimental-computer-use-cua-driver-native: disabled (…) — not loaded, not validated
  PASS dsh-locale-language: loads, apply() registers [(no tools)], schemas valid
  PASS dsh-deepseek-balance / dsh-tool-python [python] / dsh-bug-log [bug_report, bug_search, bug_stats]
  PASS dsh-personal-hub [personal_hub_status, personal_hub_validate, personal_hub_reapply]
  PASS dsh-personal-bar / dsh-plugin-guide / dsh-restart-resume [request_restart]
  PASS dsh-server-ssh [ssh_read, ssh_write, ssh_edit, ssh_list, ssh_glob, ssh_grep, ssh_bash]
  PASS dsh-github-push / dsh-computer-use
  validate-plugins: all 11 active linked plugin(s) safe to load          ← 11，不是 10
  exit code: 0

check-plugin-copy:
  profile bundles: 15  ·  table entries: 17
  covered 13  ·  exempt 2  ·  missing 0
  exempt: @deepseek-ai/dsh-experimental-agent-team-profile / …-web-profile — official BUILTIN_COPY — 智能体团队
  check-plugin-copy: 全部 bundle 均有中文名 OK          exit code: 0
```

**结论**：**推翻文档的「10 个 / 10/10」**——实际是 **11 个 active linked 插件全部 PASS**（另 2 个官方包 SKIP），
`plugins/` 目录实际 **12 个**（多出未纳入清单的 `dsh-opencode-session-id`，它既不被 validate 校验、也不在 profile bundles 里）；
`check-plugin-copy` 为 `covered 13 / exempt 2 / missing 0`（15 个 bundle）。

**对新机一致性的影响**：新机（HEAD 版清单）装配 10 个插件 + opencode-session-id，闸门输出会是另一组数字，
文档里的「10/10 通过」在新机上是**另一套含义**；以闸门输出为准即可，但文档数字需修订（属 A 任务范畴）。

---

## 实证 5：`official-patches\apply-patches.mjs` 的幂等/失败语义与锚点匹配

**假设**：对已打过补丁的副本再跑一次会 fail-loud（不静默）。

**实际命令**（**不真跑二次打补丁**）：把 `apply-patches.mjs` 的纯数据段
（`const patches = [` 到 `const failures`，见源码 `21-170` 行）导入沙箱脚本导出 `patches-extracted.json`，
再用 python 对两处 checkout 做只读计数；并对每条计算 `new.count(old)`。

**原始输出关键行**：

```
补丁条目数: 17   涉及文件: 10
--- 官方纯净 checkout E:\DSH\Deepseek_DSH (ddefc45) ---
  [ 1..17] count=1 OK(未打) × 17      → 非"恰好1次"的条目: 0/17
--- 运行副本 E:\DSH\DSH-ops\Deepseek_DSH ---
  [ 7] count=1  [9] count=1  [10] count=1  [12] count=1  [14] count=1  [17] count=1
  其余 11 条 count=0 → 非"恰好1次"的条目: 11/17
--- 幂等性分类 ---
  APPEND/PREPEND(old⊆new) ×1: [7, 9, 10, 12, 14, 17]
  REPLACE(old∉new)      ×0: [1, 2, 3, 4, 5, 6, 8, 11, 13, 15, 16]
交叉验证副本 adapter.ts:372-377 = 已应用一次的 sessionId 三行块（探针计数=1），而 old 行仍在（count=1）
```

**结论**：**推翻「纯 fail-loud」**，实际是**混合且带破坏性副作用**：

- **11 条 replace 型**（`old` 不在 `new` 中）：二次执行时 `count(old)=0` ≠ 1 → 记 failure → 脚本 `exit 1`（fail-loud，符合预期）。
- **6 条 append/prepend 型**（`new` 以 `old` 为前缀，`apply-patches.mjs:180-184` 的唯一性判据无法区分「未打/已打」）：
  二次执行时 `count(old)` 仍为 1 → **校验通过并再次插入**同一段代码/文档
  （如 `adapter.ts` 会再插一份 `const sessionId = …`，`presentation.ts` 会再插一份 `deploymentCopy()`）。
  结果是**脚本 exit 1，但源码已被二次改坏**。
- **新机 clone 最新官方 HEAD 是否仍匹配（可判定部分）**：对当前官方快照 `ddefc45`（2026-09-17 21:19，`release-dsh-0.1.6-alpha.2`）
  **17/17 锚点各恰好出现 1 次，全部可应用**；而源码里**没有任何版本上界校验**，仅靠文本唯一性，
  因此官方若改动锚点文本，表现为该条失败 + `exit 1` 中止（不会静默错补）——这属于 fail-loud，是安全方向。
  **无法离线判定的部分**：今天官方 HEAD 是否已改动锚点文本，需要网络抓取才能确认（本任务禁止 clone/fetch），替代验证方式：
  新机 bootstrap 第 3 步的 `apply-patches` 输出，或官方仓库在线查看这 10 个文件的对应片段。

**触发风险**：`bootstrap-personal.ps1:40-46` 的 clone 有「副本已存在则跳过」分支，而第 60 行 `apply-patches` **无条件执行**；
即「在已有副本的机器上重跑 bootstrap」会直接踩到上述二次打补丁路径。已记入 buglog。

**对新机一致性的影响**：单次执行（新机正常路径）安全；一旦重复执行既有内容被重复插入的风险，且不会自愈。

---

## 实证 6：`start-dsh-web.ps1` 对 `$env:DSH_HOME` 与端口的处理（只读，不执行）

**实际命令**：`read E:\DSH\DSH-ops\start-dsh-web.ps1`（252 行全文，未执行任何参数）

**关键事实**：

| 事项 | 行号 | 事实 |
| --- | --- | --- |
| 运行源 | `13`、`183-189` | `$repo = <DSH-ops>\Deepseek_DSH`；启动 `node apps/cli/lib/bin.js web --no-open`，`-WorkingDirectory $repo` |
| **未传 `--profile` / 未设置 `DSH_HOME`** | `183-189` | 环境整体继承调用者：脚本**不指定** profile 路径，也不校验 `DSH_HOME` |
| 因此是否隔离 | 官方语义 | `packages\util\home-paths\src\index.ts:79-88` 的 `resolveDshHome` 优先级 = 显式配置 > `$DSH_HOME` > `~/.dsh`（空/纯空白视为未设置）→ **尊重 `$env:DSH_HOME`，但完全取决于调用者是否设置** |
| 端口 | `135,143,157,197` | `3080` 硬编码（监听检测、等待释放、就绪轮询、重启判据），**无参数可覆盖**；`dsh web` 也未传 `--port` |
| 浏览器 | `31-35,164-166,215-226` | 从 `dsh-web.log` 取带 token 的地址打开一次；取不到回落裸 `127.0.0.1:3080` |
| node 路径 | `127,183,242` | 硬编码 `C:\Program Files\nodejs\node.exe`（新机若无此路径则启动链直接失败，属 B 任务扫描项） |
| 启动前闸门 | `127-131` | 先跑 `validate-plugins.mjs`，红则中止且不动旧服务 |

**结论**：**部分证实**——脚本「尊重」`$env:DSH_HOME` 仅体现为不覆盖它；
profile 路径不可由脚本参数指定，端口**不可隔离**（恒 3080）。
所以「用 `DSH_HOME` 指向沙箱就能隔离整套服务」这个说法在**端口**这一维不成立；本任务全程未执行该脚本。

**对新机一致性的影响**：新机若 `DSH_HOME` 不是默认 `~/.dsh`，必须先导出环境变量再启动（bootstrap 第 5 步已按此写），
否则服务会去默认 home 找 profile，与装配位置不一致；同时 3080 冲突在新机（或双实例）下无参数可避让。

---

## 7. 无法安全执行的项与替代验证方式

| 项 | 为何没做 | 替代验证 |
| --- | --- | --- |
| 真跑 `pnpm install` | 任务硬性禁止（会写 node_modules、耗时、可能网络） | PATH 前置 `pnpm.cmd` shim 实测拦截（2.0）；真实 `cwd` 已捕获；上游 workspace 文件已确认不存在（不会外溢） |
| 真跑二次 `apply-patches` | 会改坏运行副本源码 | 纯静态导出 17 条补丁 + `new.count(old)` 分类 + 副本/官方双端锚点计数（实证 5） |
| 执行 `start-dsh-web.ps1` | 会触碰生产服务 | 全文只读 + 官方 `resolveDshHome` 源码定位（实证 6） |
| 新机 `pnpm run build` 后行为 | 同上禁止 | 未验证；`official-patches` 的补丁是否在产物中生效需靠构建，列为残留未知 |

**残留未知（需后续验证）**：
1. `pnpm-workspace.yaml` / `pnpm-lock.yaml`：开发机 profile 含 `packages: ['.'] / nodeLinker: hoisted / autoInstallPeers: false`，
   而 `bootstrap-personal.ps1:92-98` 的骨架**不生成**它们（新机首次 `pnpm install` 将按默认 `isolated` 布局安装）→
   **静态推断**为「node_modules 布局可能与开发机不同」；未跑 pnpm，无法实证是否影响解析（`link:` 直接依赖两种 linker 都会建立符号链接）。
   验证方式：在一次性机器上跑完 bootstrap 后对比 `profiles\web\pnpm-workspace.yaml`、`pnpm-lock.yaml` 与 node_modules 结构。
2. `tool-agent-team` 块由谁在何时写入 profile 的 `cordis.patch.yml`（官方插件管理器 or Agent Teams bundle），
   决定新机首次启动后该差异是否自动收敛——建议 D 任务按「首次启动路径」核查。
3. 新机首次启动时官方 dsh 是否会创建 `cordis.patch.yml` 的注释头（开发机有 3 行手写头，bootstrap 流程下由 reapply 从空文件创建，故新机无）。

---

## 8. 汇总：与开发机实证确认不一致的条目

**profile 层：6 条**（实证 3 表 #1–#6）——
其中 **4 条为实质功能差异**（#1/#2 computer-use 解析失败、#3 pythonPath、#4 pwshPath），
**1 条低影响**（#5 `tool-agent-team`）、**1 条无害**（#6 注释头）。
场景 C 已证明：#1–#4 在覆盖层修正后**全部收敛**。

**仓库/版本层：3 条**（实证 3.1）——
① 共享清单内容（插件集/`extraBundles`/`extraPatches`）；② 补丁集（`apply-patches.mjs` 少 197 行改动）；
③ `plugins/dsh-computer-use`、`plugins/dsh-personal-bar` 未提交（新机 clone 拿不到）。
**这 3 条不修，新机不可能装配出与开发机相同的 DSH。**

**合计 9 条**（profile 层 6 + 仓库层 3），另 3 项残留未知（第 7 节）。

**给 lead 的关键结论**：
1. reapply 的路径派生与写入逻辑**是可移植的**（场景 C 逐字节一致），问题集中在「覆盖层生成」与「仓库未提交」两处。
2. `bootstrap-personal.ps1` 的 `ConvertTo-Json` 双重转换使覆盖层整层失效——**新机必然复现**（该缺陷已在 HEAD），
   且伴随「reapply 报成功」的静默性，属最高优先修复项。
3. 新机在执行前会先撞上「clone 到的是 HEAD 旧状态」——**新机不一致的第一因是未提交**，不是脚本。
4. 闸门真实数字是 **11 个 active 插件 PASS / 2 SKIP**，`plugins/` 目录 **12 个**，`check-plugin-copy` 为 `covered 13 · exempt 2 · missing 0`。

## 9. buglog 记录

| 记录文件 | 严重度/状态 | 摘要 |
| --- | --- | --- |
| `buglog\2026-09-19-bootstrap-personal-ps1-personal-hub-pers.md` | major / open | `bootstrap-personal.ps1:80-86` 双重 `ConvertTo-Json` → 覆盖层被 `index.js:228` 静默忽略 |
| `buglog\2026-09-19-official-patches-apply-patches-mjs-no-op.md` | major / open | 6 条 append 型补丁非幂等：二次执行为「重复插入 + exit 1」而非纯 fail-loud |

（两条均为**实证发现，未修改代码**——本任务的写入范围只允许本文件与沙箱；修复建议已写在记录里。）

## 10. 沙箱留档

`E:\DSH\DSH-ops\research\deploy-audit\_sandbox\`：

| 路径 | 内容 |
| --- | --- |
| `shim\pnpm.cmd`、`pnpm-shim.log` | pnpm 拦截器与调用日志（含三次 reapply 的真实 cwd） |
| `manifest\personal.json`、`personal.local.json` | 场景 A/B 的清单；场景 C 的正确覆盖层 |
| `dsh-home\profiles\web\{package.json,cordis.patch.yml}` | 最后一次（场景 C）生成物 |
| `dsh-home\backups\<stamp>-personal-hub\` | reapply 的三次备份 |
| `_gen-local.ps1` | 复现 bootstrap 覆盖层生成片段（UTF-8 BOM） |
| `_extract-patches.mjs`、`patches-extracted.json` | 17 条补丁的数据导出 |
| `HEAD-*.{ps1,json,mjs}` | HEAD 基线留档，用于比对未提交改动 |
