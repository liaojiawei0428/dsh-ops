# 新电脑部署指南（DEPLOY.md）

在另一台电脑上完整复刻当前 DSH 环境。照此清单执行即可得到与开发机一致的环境：
同一 DSH 版本、同一插件集、同一 BUG 知识库、同一套准则与工具链、同一套运维脚本。

> 兼容目标：Windows + PowerShell 7 + Node 24 + Python 3.12。
> 本指南于 2026-08-18 在 `E:\DSH` 完整模拟验证通过（模拟 + 清理 + 回归）。

---

## ⚠️ 最重要的前提：固定路径约定

**所有运维脚本、插件、更新链路都硬编码 `D:\GongJu\` 路径**——这是设计决策，不是缺陷：
两台电脑统一用同一路径，脚本即可零修改工作。**部署时必须严格使用以下路径，不能换盘符或改名**：

| 路径 | 内容 |
|---|---|
| `D:\GongJu\Deepseek_DSH` | 官方 DSH 源码仓库 |
| `D:\GongJu\DSH-ops` | 本仓库（插件/脚本/标准/知识库） |
| `%USERPROFILE%\.dsh` | DSH 用户数据（DSH_HOME，每机独立） |

违反路径约定 = 脚本全部失效（启动/更新/闸门/版本检查都会找不到路径）。

---

## 第 0 步：环境准备（新机手工）

| 依赖 | 要求 | 验证命令 |
|---|---|---|
| Git | 任意较新版本 | `git --version` |
| Node.js | ^22.19 或 >=24（仓库 engines 要求） | `node --version` |
| pnpm | 任意（corepack 或 `npm i -g pnpm`） | `pnpm --version` |
| PowerShell 7 | >= 7（**5.1 不可用**，见 BOM/GBK 事故） | `pwsh --version` |
| Python 3 | >= 3.10（dsh-tool-python 需要） | `python --version` |
| 系统代理 | 能访问 GitHub 的代理/VPN | 控制面板 → Internet 选项 → 代理 |

---

## 第 1 步：拉取两个仓库

```powershell
# 官方仓库（私有，需 GitHub 凭据；VPN 需先开）
git clone https://github.com/deepseek-ai/deepseek-harness.git D:\GongJu\Deepseek_DSH

# DSH-ops 仓库
git clone https://github.com/liaojiawei0428/dsh-ops.git D:\GongJu\DSH-ops
```

clone 官方仓库后**必须 checkout 到开发机当前版本**（以 [version-history.md](version-history.md) 台账最新行为准）：

```powershell
git -C D:\GongJu\Deepseek_DSH checkout 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

> 以后升级一律用 `更新DSH.bat`（自动拉取官方最新并 checkout），勿手工切换版本。

---

## 第 2 步：构建 DSH 主程序

```powershell
cd D:\GongJu\Deepseek_DSH
pnpm install --frozen-lockfile
pnpm run build
node apps\cli\lib\bin.js --version   # 应输出 0.1.0-rc.7
```

---

## 第 3 步：生成 web profile

创建目录 `%USERPROFILE%\.dsh\profiles\web\`，写入两个文件。

**`package.json`**：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-deepseek-balance": "link:D:/GongJu/DSH-ops/plugins/dsh-deepseek-balance",
    "dsh-locale-language": "link:D:/GongJu/DSH-ops/plugins/dsh-locale-language",
    "dsh-tool-python": "link:D:/GongJu/DSH-ops/plugins/dsh-tool-python",
    "dsh-bug-log": "link:D:/GongJu/DSH-ops/plugins/dsh-bug-log"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-locale-language",
        "dsh-deepseek-balance",
        "dsh-tool-python",
        "dsh-bug-log"
      ]
    }
  }
}
```

**`cordis.patch.yml`**（`<用户名>` 换成新机 Windows 用户名）：

```yaml
# pwsh-sandbox: pin to PowerShell 7 — the resolver's last resort is 5.1,
# which garbles BOM-less UTF-8 (see buglog credentials incident).
- id: pwsh-sandbox
  name: '@deepseek-ai/dsh-pwsh-sandbox'
  config:
    pwshPath: 'C:\Program Files\PowerShell\7\pwsh.exe'

# tool-python: pin the interpreter absolutely.
- id: tool-python
  name: dsh-tool-python
  config:
    pythonPath: 'C:\Users\<用户名>\AppData\Local\Programs\Python\Python312\python.exe'

# deepseek-balance: repo-status/update-now target the fixed path convention.
# (Defaults are D:/GongJu/Deepseek_DSH and D:/GongJu/DSH-ops; only override if
# the machine deviates from the convention.)
- id: deepseek-balance
  name: dsh-deepseek-balance
  config:
    repoDir: 'D:/GongJu/Deepseek_DSH'
    opsDir: 'D:/GongJu/DSH-ops'
```

然后在 profile 目录安装链接：

```powershell
cd %USERPROFILE%\.dsh\profiles\web
pnpm install
```

---

## 第 4 步：用户配置

**模型/主题设置**（与开发机一致，仓库已备模板）：

```powershell
# 首次执行会创建 %USERPROFILE%\.dsh\
Copy-Item D:\GongJu\DSH-ops\config\settings.yaml %USERPROFILE%\.dsh\settings.yaml
```

**API 密钥**（含密钥，永不入 git，每机独立）：

编辑 `%USERPROFILE%\.dsh\.credentials.yaml`（两行 `KEY: value` 格式）：

```yaml
DEEPSEEK_API_KEY: sk-你的deepseek密钥
ZAI_API_KEY: 你的智谱密钥
```

> 也可先留空启动，在 Web 界面 设置 → 模型中填写，效果相同。

---

## 第 5 步：验证（全部通过才算部署成功）

```powershell
# 1. 插件闸门（重启前必跑）
node D:\GongJu\DSH-ops\validate-plugins.mjs
# 期望: 4 个插件全部 PASS

# 2. 组合树
node D:\GongJu\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config
# 期望: 出现 pwsh-sandbox / locale-language / deepseek-balance / tool-python / bug-log 行

# 3. 启动
D:\GongJu\DSH-ops\启动DSH.bat
# 期望: 提示"已是最新版本" + 浏览器打开 http://127.0.0.1:3080
```

启动后检查：

- 会话头部出现 **余额胶囊** 与 **版本胶囊**（`DSH版本号：0.1.0-rc.7`）
- 悬停版本胶囊：`本地提交` 与 `官方最新` 一致
- 模型工具列表含 `python`、`bug_report`、`bug_search`、`bug_stats`
- `http://127.0.0.1:3080/api/dsh/repo-status` 返回 `{"version":"0.1.0-rc.7",...}`

---

## 第 6 步：例行维护（与开发机一致）

| 操作 | 命令 |
|---|---|
| 检查官方仓库更新 | 启动时自动（check-update.ps1）或 `更新DSH.bat` |
| 升级 DSH | `更新DSH.bat`（全套守卫 + 版本台账自动记录） |
| 自动更新 | 点击版本胶囊「有新版本」即触发 |
| 同步插件/知识库 | `git -C D:\GongJu\DSH-ops pull`（buglog、台账、标准随之更新） |

---

## 已知差异（无法通过本仓库同步）

| 项 | 说明 |
|---|---|
| 密钥/模型设置 | 每台机器独立，见第 4 步 |
| 系统代理 | 每台机器独立（GitHub 访问必需） |
| DSH 官方仓库版本 | 各机器可能停在各自升级时的版本；以版本台账为准，用 `更新DSH.bat` 对齐 |

---

## 部署历史

- 2026-08-18：按本指南在 `E:\DSH` 完整模拟部署验证通过（clone→build→profile→配置→启动→路由验证→清理）。
  发现并修复：`validate-plugins.mjs`/`disable-plugin.mjs` 硬编码用户路径（已改动态解析）；
  补 settings.yaml 复制步骤；淘汰旧部署脚本（setup.ps1 / 安装DSH.bat / DEPLOY.txt / README.txt）。
