# T1 部署模拟执行流水（run-log.md）

**任务**：以「新机视角」把 `E:\DSH\DSH-ops\DEPLOY.md` 当作**唯一部署依据**，在 `F:\ceshi_1` 从零部署一套 DSH，并记录文档与现实不符之处。
**执行员**：T1　**日期**：2026-09-20　**时间盒**：60 分钟（实际用 ≈25 分钟）
**结果**：✅ **成功** —— 第 1–5 步全部完成，3081 验证通过，三份产出齐全
**安全不变量**：正式服务 3080 pid **44804 全程未变**；`C:\Users\Administrator\.dsh` **仅只读复制**；未运行 `start-dsh-web.ps1` / `watchdog-dsh.ps1` / `update-dsh.ps1`

> **口径说明**：本文中标注「**文档外知识**」的地方，即为 `doc-defects.md` 记录的缺陷来源。

---

## 0. 基线（09:36:22）

```powershell
# 目标目录与隔离 DSH_HOME 状态
Test-Path F:\ceshi_1            # → True，0 项（空目录）
Test-Path F:\ceshi_1\.dsh-home  # → False（尚未创建）
```

工具链现状（**仅记录，未安装任何东西**）：

| 工具 | 路径 | 版本 |
|---|---|---|
| git | `C:\Tools\Git\cmd\git.EXE` | 2.47.1.windows.2 |
| node | `C:\Program Files\nodejs\node.EXE` | v24.16.0 |
| pnpm | `C:\Users\Administrator\AppData\Roaming\npm\pnpm.CMD` | 11.22.0 |
| pwsh | `E:\GongJu\7\pwsh.EXE` | 7.x（非标准安装位） |
| python | `…\WindowsApps\python.EXE`（Store 桩） | 真实解释器 3.14.6 可用 |

对照 DEPLOY.md 第 0 步（第 44-52 行）：git/node/pnpm/pwsh/python 均已具备，**无需安装**。故第 0 步跳过实际安装动作（新机上这一步是手工装，不属于本次可执行范围）。

---

## 1. 第 1 步：拉取个人仓库（DEPLOY.md:66-72）

### 尝试 1 —— 严格照文档原样（**失败**）

```powershell
cd F:\ceshi_1
git clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops
```

**原始输出**（09:36:34 → 09:37:15，**41 秒**）：

```
Cloning into 'DSH-ops'...
error: RPC failed; curl 28 Recv failure: Connection was reset
fatal: expected flush after ref listing
```

**退出码**：`128`

**文档预期**（DEPLOY.md:87 附近的说明性文字）：clone 成功即可进入第 2 步。
**实际**：直连 github.com:443 被重置。
**文档缺口**：第 1 步是**手工 clone**，而 DEPLOY.md:52 只交代「bootstrap 不做诊断，克隆失败请先确认代理」——**未给出设置代理的具体命令** → 记为缺陷 **D1**。

**残留检查**：`F:\ceshi_1\DSH-ops` 不存在（git clone 失败后自行清理，无残留）。

### 尝试 2 —— 用文档外知识（代理）重试（**成功**）

```powershell
# 【文档外知识】任务环境事实：系统代理 http://127.0.0.1:7688
git -c http.proxy=http://127.0.0.1:7688 clone https://github.com/liaojiawei0428/dsh-ops.git DSH-ops
```

**原始输出**（09:37:24 → 09:37:41，**16.9 秒**）：

```
Cloning into 'DSH-ops'...
```

**退出码**：`0` ✅

**clone 结果核对**（54 项）：

| 项 | 值 |
|---|---|
| HEAD | `3664f90d819a4c2c983403c66afc2d6088523d8b` |
| 提交标题 | `fix(deploy): 补齐审核清单剩余项（bootstrap 前置检查、S8 可脚本化交付判定、报告对账）` |
| `git status --porcelain` | **空** ✅ |
| `git log origin/main..HEAD` | **空** ✅ |
| `official-patches/official-ref.txt` | 存在，声明值 `dsh-v0.1.6-alpha.2` ✅ |
| `personal-hub/personal.local.json` | **不存在**（gitignore，符合预期，待 bootstrap 生成） |
| `Deepseek_DSH/` | **不存在**（gitignore，待 bootstrap 克隆） |

**对照 DEPLOY.md:287-304「交付前检查」**：两项期望为空 —— **实测均为空**，交付状态干净（前次审核的 B1 阻断项已修复）。

---

## 2. 第 2 步：一键部署（DEPLOY.md:83-87）

### 命令

```powershell
Set-Location 'F:\ceshi_1\DSH-ops'
$env:DSH_HOME   = 'F:\ceshi_1\.dsh-home'      # DEPLOY.md:56-62 要求的隔离
$env:HTTPS_PROXY = 'http://127.0.0.1:7688'    # 【文档外知识】代理（bootstrap 的两处 clone 需它）
$env:HTTP_PROXY  = 'http://127.0.0.1:7688'
pwsh -File .\bootstrap-personal.ps1
```

**耗时**：09:38:11 → **09:52:21**，**14 分 10 秒**　**退出码**：`0` ✅

### 2.1 前置条件检查（新增，DEPLOY.md:91-94）

```
前置 OK : git git version 2.47.1.windows.2
前置 OK : node v24.16.0
前置 OK : pnpm 11.22.0
前置 OK : python（C:\Users\Administrator\AppData\Local\Microsoft\WindowsApps\python.exe）
官方版本锚点 : dsh-v0.1.6-alpha.2（来源: official-patches\official-ref.txt）
```

**文档预期**：缺项在动手前列出并给 winget 命令后 `exit 1`；python 只警告不拦（DEPLOY.md:91-93）。
**实际**：✅ 检查执行了，四项均放行。
**发现**：python 那一行报的是 **Microsoft Store 桩**（`…\WindowsApps\python.exe`）却标 `前置 OK`，与 DEPLOY.md:50「勿用 Microsoft Store 版」矛盾 → 记为缺陷 **D6**（实测无害，见下）。

### 2.2 步骤 1/5：克隆官方源码 → `.\Deepseek_DSH\`

```
1/5 克隆官方仓库...
Cloning into 'F:\ceshi_1\DSH-ops\Deepseek_DSH'...
Note: switching to 'ddefc45fbc7f8e46dd73185e68295696d1297887'.
You are in 'detached HEAD' state. ...
Updating files: 100% (12072/12072), done.
     origin refspec: '+refs/tags/dsh-v0.1.6-alpha.2:refs/tags/dsh-v0.1.6-alpha.2' → '+refs/heads/*:refs/remotes/origin/*'
```

**文档预期**：clone 到副本；两处克隆按入库锚点取值（DEPLOY.md:95-98）。
**实际**：✅ 锚点生效（`--branch dsh-v0.1.6-alpha.2` → detached HEAD，符合 DEPLOY.md:228）；refspec 已被 `Initialize-PinnedClone` 修正，符合 DEPLOY.md:235。
**产出**：12072 文件，HEAD = `ddefc45f…`（**与开发机官方 checkout 同一提交**）。

### 2.3 步骤 1b/5：克隆平级官方 checkout → `..\Deepseek_DSH\`

```
1b/5 克隆平级官方 checkout（升级链拉取源）...
     F:\ceshi_1\Deepseek_DSH
Cloning into 'F:\ceshi_1\Deepseek_DSH'...
   （同样的 detached HEAD 提示 + refspec 修正）
Updating files: 100% (12072/12072), done.
```

**实际**：✅ 12072 文件，HEAD 同为 `ddefc45f…`。
**对照 DEPLOY.md:37-38**：「两份缺一不可」—— 两处均已创建 ✅

### 2.4 步骤 2/5：pnpm install

```
2/5 pnpm install（首次约 3-4 分钟）...
Scope: all 314 workspace projects
[WARN] There are cyclic workspace dependencies: …（官方 lockfile 既有告警，非本次问题）
✓ Lockfile passes supply-chain policies (verified 1d ago)
Lockfile is up to date, resolution step is skipped
Packages: +1319
（pnpm 提示可升级到 12.5.1 —— 前置要求 11+，通过）
```

**文档预期**：首次约 3-4 分钟（DEPLOY.md:99）。
**实际**：✅ 成功，无报错。实际耗时约 4 分钟。

### 2.5 步骤 3/5：应用官方补丁

```
3/5 应用官方补丁...
（24 条 ✓ + 7 条 restore ✓）
```

**文档预期**：**24 条精确文本替换 + 7 个文件恢复**，异常即 fail-loud（DEPLOY.md:100-101）。
**实际**：✅ **24 + 7 全部成功**，与文档声明**完全一致**（逐条解析核实）。

### 2.6 步骤 4/5：pnpm run build

```
4/5 构建个人副本...
$ tsc -b tsconfig.host.json && tsdown --env.DSH_BUILD_FACE host
   …（host 面全部 Build complete）…
$ tsc -b tsconfig.client.json && tsdown --env.DSH_BUILD_FACE client
   …
   ✔ [@deepseek-ai/dsh-experimental-client-ui-agent-team/client] [CJS] lib\client.js 174.15 kB │ gzip: 33.25 kB
   ✔ [@deepseek-ai/dsh-experimental-client-ui-agent-team/client] Build complete in 5847ms
   …（client 面全部 Build complete）…
$ pnpm --filter @deepseek-ai/dsh-web-frontend run build
   vite v6.4.3 building for production...
   ✓ 371 modules transformed.
   ✓ built in 5.09s
   build: recorded 248 client artifact(s) with 3 public value(s)
```

**文档预期**：副本构建成功，产物带补丁（DEPLOY.md:102）。
**实际**：✅ **三个阶段（host / client / web）全部成功**。
**⚠️ 本次模拟的关键验证点**：`client` 阶段（`tsc -b tsconfig.client.json`）**通过**，其中 `client-ui-agent-team` 正常构建完成 —— 即**未重现**此前运行副本的 `SessionStore` 缺 `binding/refreshSubagents/retainInfo`（TS2339）失败。这证实：24 条补丁版（含 `agent-team` 的本地 `TeammateAgentOptions` 类型修复）在新机从零部署时不会触发该错误。

### 2.7 步骤 5/5：profile 装配

```
5/5 装配 web profile（reapply-cli 按清单重建）...
  DSH_HOME = F:\ceshi_1\.dsh-home（个人 profile 装配到这里）
  已生成覆盖层 F:\ceshi_1\DSH-ops\personal-hub\personal.local.json
    pwshPath          = E:\GongJu\7\pwsh.exe
    pythonPath        = C:\Users\Administrator\AppData\Local\Python\pythoncore-3.14-64\python.exe
    extraDependencies = 2 条官方包 link（指向本机副本 packages, 盘符自由）
  已初始化 profile 骨架: F:\ceshi_1\.dsh-home\profiles\web\package.json
{
 "ok": true,
 "actions": [
  "已备份 profile 文件到 F:\\ceshi_1\\.dsh-home\\backups\\2026-09-20T01-52-21-210Z-personal-hub",
  "package.json 已按清单重写（dependencies + dsh.profile.bundles；清单外保留 0 项）",
  "cordis.patch.yml 托管条目已按清单重生成（官方块原样保留）",
  "pnpm install 完成",
  "复检无漂移"
 ]
}
==== 部署完成 ====
```

**文档预期**（DEPLOY.md:103-107、116-128）：13 条 link、15 条 bundles、覆盖层自动生成、`{"ok": true}` + 「复检无漂移」。
**实际**：✅ 全部符合。
- 覆盖层生成的 `pythonPath` 是**真实解释器**（`…\pythoncore-3.14-64\python.exe`）而非 Store 桩 → **D6 实测无害**得到证实
- `extraDependencies` 指向 `F:\ceshi_1\...`（**盘符自由**）

**⚠️ 收尾提示未适配隔离模式**（输出）：

```
下一步（详见 DEPLOY.md）:
  1. 恢复用户数据: ~/.dsh/settings.yaml 与 .credentials.yaml（备份或手工配置）
```

隔离演练时 profile 在 `F:\ceshi_1\.dsh-home`，提示词却写 `~/.dsh` → 记为缺陷 **D5**。

---

## 3. 第 3 步：用户数据（DEPLOY.md:132-145）

照文档表格（第 136-142 行）逐项从旧机**只读复制**到隔离 `DSH_HOME`：

| # | 项 | 源（只读） | 结果 |
|---|---|---|---|
| 1 | `settings.yaml` | `C:\Users\Administrator\.dsh\settings.yaml` | ✅ 7325 B |
| 2 | `.credentials.yaml` | 同上 | ✅ 559 B |
| 3 | `AGENTS.md` | 同上 | ✅ 5028 B |
| 4 | `github-push\credentials.json` | 同上 | ✅ 355 B |
| 4 | `server-ssh\` | 同上 | ✅ 1 文件 |
| 5 | `backups\`（可选） | 同上 | ✅ 168 文件 |

**说明**：文档推荐「**从旧机复制** settings.yaml」（DEPLOY.md:138），本次照做 —— 因此**未触发**「骨架缺 3 个命名空间」的问题（该声明已单独核实为准确：仓库模板确缺 `shell` / `subagent-model-selection` / `llm-deepseek`）。

**源目录未被修改**：全程 `copy2`/`copytree` 只读源，`C:\Users\Administrator\.dsh` 无任何写入。

---

## 4. 第 4 步：启动与验证（DEPLOY.md:149-168）

> **偏差声明**：文档给的是 `pwsh -File .\start-dsh-web.ps1`（DEPLOY.md:152）。该脚本按 **3080** 判存活（`start-dsh-web.ps1:180-192`），在同机演练时会把正式服务误判为"已在运行"并打开**正式服务页面**。任务契约因此指定了**等价替代**（换 3081 直起 CLI）→ 记为缺陷 **D2**。

### 4.1 验证 2：插件闸门（DEPLOY.md:160）

```powershell
Set-Location 'F:\ceshi_1\DSH-ops'; $env:DSH_HOME='F:\ceshi_1\.dsh-home'
node validate-plugins.mjs
```

```
PASS dsh-locale-language: loads, apply() registers [(no tools)], schemas valid
PASS dsh-deepseek-balance: …
PASS dsh-tool-python: loads, apply() registers [python], schemas valid
PASS dsh-bug-log: loads, apply() registers [bug_report, bug_search, bug_stats], schemas valid
PASS dsh-personal-hub: … [personal_hub_status, personal_hub_validate, personal_hub_reapply] …
PASS dsh-personal-bar: …
PASS dsh-plugin-guide: …
PASS dsh-restart-resume: … [request_restart] …
PASS dsh-server-ssh: … [ssh_read, ssh_write, ssh_edit, ssh_list, ssh_glob, ssh_grep, ssh_bash] …
PASS dsh-github-push: …
PASS dsh-computer-use: …
validate-plugins: all 11 active linked plugin(s) safe to load
```

**文档预期**：11 个挂载插件全 PASS，退出码 0（DEPLOY.md:160）。**实际**：✅ **11/11 PASS，exit 0**

### 4.2 验证 3：中文文案（DEPLOY.md:161）

```powershell
node check-plugin-copy.mjs
```

```
check-plugin-copy: profile F:\ceshi_1\.dsh-home\profiles\web
  profile bundles: 15  ·  table entries: 17
  covered 13  ·  exempt 2  ·  missing 0
check-plugin-copy: 全部 bundle 均有中文名 OK
```

**文档预期**：`missing 0`（DEPLOY.md:161）。**实际**：✅ **missing 0，exit 0**
**附带证据**：输出的 profile 路径是**隔离路径** → 证明 `DSH_HOME` 隔离生效（符合 DEPLOY.md:56-62）。

### 4.3 部署链自检（契约要求；DEPLOY.md 未列）

```powershell
node test-standard.mjs
```

```
PASS  T4: disable removes the bundle entry and reports recovery
PASS  T5: deploy-chain hygiene (10 .ps1 keep BOM, 3 .cmd/.bat pure ASCII)
test-standard: all 5 checks hold
```

**实际**：✅ **5/5 PASS，exit 0**（建议纳入文档验收清单 → 缺陷 **D7**）

### 4.4 验证 5：版本（DEPLOY.md:163）

```powershell
node .\Deepseek_DSH\apps\cli\lib\bin.js --version
```

```
0.1.6-alpha.2
```

**文档预期**：`0.1.6-alpha.2`（与开发机一致）。**实际**：✅ 一致

### 4.5 验证 4：组合树（DEPLOY.md:162）

```powershell
node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config
```

**退出码** `0`，输出 630 行 / 20736 字节。逐条核对 15 条 bundle：

```
OK  @deepseek-ai/dsh-base                              OK  dsh-restart-resume
OK  @deepseek-ai/dsh-web-app                           OK  dsh-server-ssh
OK  dsh-locale-language                                OK  dsh-github-push
OK  dsh-deepseek-balance                               OK  dsh-computer-use
OK  dsh-tool-python                                    OK  @deepseek-ai/dsh-experimental-agent-team-profile
OK  dsh-bug-log                                        OK  @deepseek-ai/dsh-experimental-agent-team-web-profile
OK  dsh-personal-hub
OK  dsh-personal-bar
OK  dsh-plugin-guide
缺失: 无 —— 15 条全部出现 ✅
```

文档点名要求的 7 个 id（`dsh-server-ssh / dsh-github-push / dsh-personal-hub / dsh-deepseek-balance / dsh-tool-python / dsh-computer-use / dsh-personal-bar`）**全部出现** ✅

**profile 指纹**：bundles **15** 条、dependencies **13** 条（全部 `link:`，全部自动派生为 `F:/ceshi_1/...`）。

### 4.6 验证 6：页面（DEPLOY.md:164）—— 3081 等价替代

```powershell
$env:DSH_HOME='F:\ceshi_1\.dsh-home'
node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --port 3081 --no-open
```

**启动耗时**：约 **9 秒**后 3081 开始监听（pid **49552**）。
**日志**（token 值不记录）：

```
dsh web: http://127.0.0.1:3081/?token=<REDACTED>
```

HTTP 验证（`ProxyHandler({})` 绕过代理）：

| 请求 | 状态 | 说明 |
|---|---|---|
| `GET /`（裸地址） | **401** Unauthorized | body: `dsh web authentication required; reopen the URL printed by dsh web.` —— **符合文档预期** |
| `GET /?token=…`（带 token） | **303** See Other | `Location: /`；`Set-Cookie: dsh-auth-…`（token 换会话 cookie，authority 段 `127.0.0.1:3081`） |
| `GET /` + 该 cookie | **200** OK | `Content-Type: text/html; charset=utf-8`，body 以 `<!doctype html>` 开头，含 `__ModuleLoader__` |

**文档预期**：裸地址 401；带 token 地址可进界面。**实际**：裸地址 ✅ 401；带 token **需两步**（303 → cookie → 200），文档未说明中间步骤 → 记为缺陷 **D4**。

**停止**（只按 3081 监听 pid）：

```powershell
Stop-Process -Id 49552 -Force
```

**停后复核**：3081 已释放 ✅；**3080 监听 pid 仍为 44804** ✅

---

## 5. 完成标准核对（契约第【完成标准】节）

| 标准 | 结果 |
|---|---|
| 部署推进到第 5 步 profile 装配完成 | ✅ `{"ok": true, …"复检无漂移"}` |
| 3081 端口成功提供带 token 的页面 | ✅ 303 → cookie → **200 OK** 真实 HTML |
| 3081 实例已停掉 | ✅ pid 49552 已停，端口释放 |
| 三份产出齐全 | ✅ `run-log.md` / `doc-defects.md` / `artifacts.json` |
| 正式服务与 `~/.dsh` 未被触碰 | ✅ 3080 pid 44804 全程不变；`~/.dsh` 仅只读复制 |

---

## 6. 时间线汇总

| 阶段 | 开始 | 结束 | 耗时 | 结果 |
|---|---|---|---|---|
| 基线记录 | 09:36:22 | 09:36:30 | 8 s | — |
| 第 1 步 clone（尝试 1，直连） | 09:36:34 | 09:37:15 | **41 s** | ❌ exit 128 |
| 第 1 步 clone（尝试 2，代理） | 09:37:24 | 09:37:41 | **16.9 s** | ✅ exit 0 |
| 第 2 步 bootstrap | 09:38:11 | 09:52:21 | **14 m 10 s** | ✅ exit 0 |
| └ 前置检查 | 09:38:11 | 09:38:2x | ~15 s | ✅ |
| └ 1/5 克隆副本 | — | — | ~2 m | ✅ 12072 文件 |
| └ 1b/5 克隆平级 | — | — | ~2 m | ✅ 12072 文件 |
| └ 2/5 pnpm install | — | — | ~4 m | ✅ +1319 包 |
| └ 3/5 补丁 | — | — | ~5 s | ✅ 24 + 7 |
| └ 4/5 build | — | — | ~5 m | ✅ host+client+web |
| └ 5/5 profile | — | — | ~20 s | ✅ ok:true |
| 第 3 步 用户数据复制 | 09:52:2x | 09:52:4x | ~20 s | ✅ |
| 第 4 步 闸门（3 个） | 09:53 | 09:56 | ~3 m | ✅ 全 exit 0 |
| 第 4 步 dump-config / version | 09:56 | 09:57 | ~40 s | ✅ |
| 第 4 步 3081 启动 + HTTP | 09:56:5x | 09:58 | ~1 m | ✅ |
| 3081 停止 + 复核 | 09:59 | 09:59 | ~10 s | ✅ |
| 产出撰写 | 10:00 | 10:1x | ~15 m | ✅ |
| **合计（部署本体）** | **09:36** | **09:59** | **≈23 分钟** | ✅ |

---

## 7. 未做/未验证事项（如实声明）

1. **未运行 DEPLOY.md:159 的健康检查** —— 契约禁止运行 `start-dsh-web.ps1` / `watchdog-dsh.ps1`；且健康检查按 3080 判存活并会复活看门狗，同机演练下会干扰正式服务（记为缺陷 **D3**，属**推断**：未实跑验证干扰是否真会发生）。
2. **未运行 `start-dsh-web.ps1`** —— 同契约约束；D2 的"会静默指向正式服务"结论来自**读源码**（`start-dsh-web.ps1:180-192`），未实跑复现。
3. **未验证 `.bat` 双击入口**（`启动DSH.bat` / `更新DSH.bat`）—— 契约未要求，且它们会拉起正式服务链。
4. **未验证升级链**（`update-dsh.ps1` / `sync-official.ps1`）—— 破坏性操作，契约禁止。
5. **未验证模型实际可用性** —— 需要真实 API 调用；本次只验证"服务能起、插件能载、组合树完整"。
6. **第 0 步的依赖安装未实际执行** —— 本机已具备全部依赖，无新机可装。
7. **`--port 3081` 属文档外知识** —— DEPLOY.md 只给 3080；换端口起 CLI 的写法未见于文档（D2）。
