# 新电脑部署指南（DEPLOY.md）

在另一台电脑上，按本文档从零部署**与开发机完全相同的一套个人 DSH**（官方版本 + 个人插件 + 个人配置）。

## 架构速览

```
<个人仓库根>/DSH-ops\（git → github.com/liaojiawei0428/dsh-ops）
├── Deepseek_DSH\            官方源码副本（运行源；独立 node_modules + 本地补丁；.gitignore 不入个人 git）
├── plugins\                 自研插件（10 个）
├── personal-hub\            个人层清单（personal.json（机器无关）+ personal.local.json（机器特定, gitignore））
├── official-patches\        官方补丁（apply-patches.mjs 精确文本替换）
├── bootstrap-personal.ps1   一键部署（本指南核心）
├── reapply-cli.mjs          按清单重建 profile 的命令行入口
├── sync-official.ps1        官方 → 副本增量同步（日常更新）
├── start-dsh-web.ps1        服务启动（从副本运行）
├── update-dsh.ps1           官方升级链（拉官方 → 同步副本 → 补丁 → 重启）
└── 更新DSH.bat / 启动DSH.bat  用户入口
```

官方仓库（`<个人仓库根>/Deepseek_DSH` 之外的独立克隆）只在升级时使用，日常运行不依赖它——服务从个人副本启动。

---

## 第 0 步：环境准备（新机手工，一次性）

| 依赖 | 版本要求 | 说明 |
|---|---|---|
| Git | 任意现代版 | `git --version` |
| Node.js | **^22.19 或 >=24** | `node -v`；npm 自带 |
| pnpm | 11+（官方 lockfile 用 pnpm 11） | `corepack enable` 或 `npm i -g pnpm@11` |
| PowerShell 7 | 7.x | `pwsh -v`；Windows 自带 5.1，**必须装 7** |
| VS Build Tools（C++ 工作负载） | 最新 | `vswhere` 探测；**仅当官方更新引入原生依赖（如 fs-ext）时需要** |
| 网络 | GitHub 可达 | 本机通常需代理/VPN（`lib-proxy.ps1` 自动诊断：代理或 TUN 任一即可） |

安装完成后重启终端。以下命令中的 `<个人仓库根>` 可为任意目录（盘符自由），例如 `F:\QiTa\ceshi`。

> ⚠️ **演练/隔离部署必读**：设置环境变量 `DSH_HOME=<隔离目录>`（如 `F:\QiTa\ceshi\.dsh-home`），
> 使 profile 装配到隔离目录而不是 `~/.dsh`。新机正式部署**不设** DSH_HOME（默认 `~/.dsh`）。

---

## 第 1 步：拉取个人仓库

```powershell
cd F:\QiTa
git clone https://github.com/liaojiawei0428/dsh-ops.git ceshi
cd ceshi
```

> 隔离演练时：
> ```powershell
> $env:DSH_HOME = 'F:\QiTa\ceshi\.dsh-home'   # 只对当前会话生效
> ```

---

## 第 2 步：一键部署（bootstrap-personal.ps1）

```powershell
pwsh -File .\bootstrap-personal.ps1
```

脚本按顺序完成 5 步（每步有进度输出，任一步失败即中止并说明原因）：

1. **克隆官方仓库** → `.\Deepseek_DSH\`（`git clone --depth 1` 官方 deepseek-harness；需要网络可达 GitHub，代理自动诊断）
2. **pnpm install** → 副本依赖（首次约 3-4 分钟）
3. **应用官方补丁** → `official-patches\apply-patches.mjs`（2 个补丁：connection rpc 崩溃修复 + descriptor v2 兼容；目标文本唯一性校验，异常即 fail-loud）
4. **pnpm run build** → 副本构建（产物带补丁；首次数分钟）
5. **profile 装配** → `reapply-cli.mjs` 按个人层清单重建 `%DSH_HOME%\profiles\web`：
   - 依赖/链接（plugins → 副本 `plugins\`，路径运行时派生，盘符自由）
   - bundles（官方 2 + 自研 10）
   - `cordis.patch.yml` 托管条目（pwsh-sandbox / tool-python 等本机覆盖）
   - 自动 `pnpm install` + 复检无漂移

> 可选项：
> - `-SkipInstall`：跳过依赖安装（已在副本预装时）
> - `-SkipProfile`：跳过 profile 装配（只做代码+构建）
> - 隔离演练时若 `personal-hub\personal.local.json` 不存在，脚本自动生成（含以当前机 pwsh 路径填充的 pwsh-sandbox 覆盖）

**期望输出**（最后几行）：
```
5/5 装配 web profile（reapply-cli 按清单重建）...
  DSH_HOME = ...（默认 %USERPROFILE%\.dsh）
  覆盖层已存在/已生成 ...
  { "ok": true, "actions": [ ..., "复检无漂移" ] }
==== 部署完成 ====
```

---

## 第 3 步：用户数据（%DSH_HOME% 或 ~/.dsh）

bootstrap 已重建 `profiles\web\`。还需要**用户数据文件**（含密钥，不入仓库）：

1. **`settings.yaml`**（`%DSH_HOME%` 下）
   - 新机：从仓库拷贝 `config\settings.yaml` 模板，按本机修改（模型 provider / 语言 / 代理等）
   - 演练：可直接用模板原样（默认即可）
2. **`.credentials.yaml`**（含 API Key，密钥）
   - 从旧机 `~/.dsh/.credentials.yaml` 复制，或按格式重新填写
   - **永不提交仓库**

> 演练/验证时若只需"服务能起来"：`settings.yaml` 用仓库模板、`credentials.yaml` 可暂缺（模型调用会报未配置，但服务本身可启动）。

---

## 第 4 步：启动与验证

```powershell
pwsh -File .\start-dsh-web.ps1
```

验证清单（全部通过才算部署成功）：

| # | 检查 | 命令/期望 |
|---|---|---|
| 1 | 健康检查 | `python .\health-check.py` → 全绿 |
| 2 | 插件闸门 | `node .\validate-plugins.mjs` → **10 个 PASS** |
| 3 | 自研插件 | 输出含 `dsh-server-ssh / dsh-github-push / dsh-personal-hub / dsh-deepseek-balance / dsh-opencode-session-id` 等 |
| 4 | 版本 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --version` → 与开发机一致（如 0.1.5-alpha.1） |
| 5 | 组合树 | `node .\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` → 自研插件行全部出现 |
| 6 | 页面 | 浏览器打开 `http://127.0.0.1:3080` → 登录 token（`dsh-web.log`）→ 个人工具栏（SSH/推送/余额）可见 |

> **隔离演练注意**：若 3080 已被本机其他 DSH 占用，可临时让演练实例用其他端口（改 `settings.yaml` 的 webServer port，或先停其他实例）。日常新机无冲突。

---

## 日常维护（与开发机一致）

| 操作 | 命令 |
|---|---|
| 升级官方 + 同步副本 | `双击 更新DSH.bat`（update-dsh.ps1：拉官方 → 构建 → sync 副本 → 补丁 → 副本构建 → 重启） |
| 仅同步官方到副本 | `pwsh -File .\sync-official.ps1` |
| 重新应用补丁 | `node .\official-patches\apply-patches.mjs .\Deepseek_DSH\packages` |
| 修改配置后推送 | push 插件（绑定 `dsh-ops`），或 `git push` |

---

## 已知差异 / 边界

- **补丁随官方升级失效**：官方若合入相同修复或改动同一处，`apply-patches.mjs` 会因目标文本不唯一而 fail-loud——属预期，需人工核对后更新补丁文件。
- **凭据/密钥不入仓库**：`settings.yaml`、`.credentials.yaml`、`personal.local.json` 均为本机文件；新机必须手工提供。
- **模型 provider**：settings.yaml 中 llm-pi-ai 的 provider 配置是本机特有的模型通道；新机按需要调整。
- **演练隔离**：务必用 `DSH_HOME=<隔离目录>` 演练，避免覆盖正在使用的 `~/.dsh`。
- **Node 版本**：官方要求 `^22.19 || >=24`；pnpm 11+。
- **原生依赖**：官方 lockfile 若含 fs-ext 等原生模块，新机需 VS Build Tools（C++）——缺则 `pnpm install` 报错，按提示安装。