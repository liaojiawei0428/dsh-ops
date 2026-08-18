# 新电脑部署指南（DEPLOY.md）

在另一台电脑上复刻当前 DSH 环境。照此清单执行即可得到与开发机一致的环境：
同一 DSH 版本、同一插件集、同一 BUG 知识库、同一套准则与工具链。

> 兼容目标：Windows + PowerShell 7 + Node 24 + Python 3.12。

---

## 第 0 步：环境准备（新机手工，无法自动化）

| 依赖 | 要求 | 验证命令 |
|---|---|---|
| Git | 任意较新版本 | `git --version` |
| Node.js | ^22.19 或 >=24（仓库 engines 要求） | `node --version` |
| PowerShell 7 | >= 7（**5.1 不可用**，见 BOM/GBK 事故） | `pwsh --version` |
| Python 3 | >= 3.10（dsh-tool-python 需要） | `python --version` |
| 系统代理 | 能访问 GitHub 的代理/VPN | 控制面板 → Internet 选项 → 代理 |

---

## 第 1 步：拉取两个仓库

**官方仓库**（DSH 主程序，私有）：

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git D:\GongJu\Deepseek_DSH
```

私有仓库需要 GitHub 凭据（HTTPS 用凭据管理器，或 SSH）。clone 后**必须 checkout 到开发机当前版本**：

```powershell
git -C D:\GongJu\Deepseek_DSH checkout 99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

> 版本号以 [version-history.md](version-history.md) 台账最新行为准；更新版本时用
> `update-dsh.ps1` 自动升级，勿手动 checkout 新版本。

**DSH-ops 仓库**（插件/脚本/标准/知识库）：

```powershell
git clone https://github.com/liaojiawei0428/dsh-ops.git D:\GongJu\DSH-ops
```

---

## 第 2 步：构建 DSH 主程序

```powershell
cd D:\GongJu\Deepseek_DSH
pnpm install --frozen-lockfile
pnpm run build
node apps\cli\lib\bin.js --version   # 应输出 0.1.0-rc.7
```

> `pnpm` 需安装（`corepack enable` 或 npm i -g pnpm）。

---

## 第 3 步：生成 web profile

创建目录 `%USERPROFILE%\.dsh\profiles\web\`，写入两个文件。

**`package.json`**（`<DSH-ROOT>` 换成 DSH-ops 实际路径，如 `D:\GongJu\DSH-ops`）：

```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-deepseek-balance": "link:<DSH-ROOT>/plugins/dsh-deepseek-balance",
    "dsh-locale-language": "link:<DSH-ROOT>/plugins/dsh-locale-language",
    "dsh-tool-python": "link:<DSH-ROOT>/plugins/dsh-tool-python",
    "dsh-bug-log": "link:<DSH-ROOT>/plugins/dsh-bug-log"
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

**`cordis.patch.yml`**（`<USER>` 换成新机用户名；pythonPath 若装在别的路径也一并改）：

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
    pythonPath: 'C:\Users\<USER>\AppData\Local\Programs\Python\Python312\python.exe'
```

然后在 profile 目录安装链接：

```powershell
cd %USERPROFILE%\.dsh\profiles\web
pnpm install
```

---

## 第 4 步：配置凭据与模型（新机手工，含密钥不入库）

1. **API 密钥**：编辑 `%USERPROFILE%\.dsh\.credentials.yaml`（两行 `KEY: value` 格式）：

   ```yaml
   DEEPSEEK_API_KEY: sk-你的deepseek密钥
   ZAI_API_KEY: 你的智谱密钥
   ```

2. **模型设置**：首次打开 Web 界面（`启动DSH.bat`），在设置 → 模型中填入
   智谱 GLM 配置（provider、model、apiKeyEnv 指向 `ZAI_API_KEY`）。

---

## 第 5 步：验证

```powershell
# 1. 插件闸门（重启前必跑）
node D:\GongJu\DSH-ops\validate-plugins.mjs
# 期望: 4 个插件全部 PASS

# 2. 组合树
node D:\GongJu\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config
# 期望: 出现 tool-python / bug-log / deepseek-balance / locale-language 行

# 3. 启动
D:\GongJu\DSH-ops\启动DSH.bat
# 期望: 提示"已是最新版本" + 浏览器打开 http://127.0.0.1:3080
```

启动后检查：

- 会话头部出现 **余额胶囊** 与 **版本胶囊**（`DSH版本号：0.1.0-rc.7`）
- 模型工具列表含 `python`、`bug_report`、`bug_search`、`bug_stats`
- 悬停版本胶囊：`本地提交` 与 `官方最新` 一致

---

## 第 6 步：例行维护（与开发机一致）

| 操作 | 命令 |
|---|---|
| 检查官方仓库更新 | 启动时自动（check-update.ps1）或 `更新DSH.bat` |
| 升级 DSH | `更新DSH.bat`（全套守卫 + 版本台账自动记录） |
| 自动更新 | 点击版本胶囊「有新版本」即触发（需先 `启动DSH.bat` 建立 pid） |
| 同步插件/知识库 | `git -C D:\GongJu\DSH-ops pull`（buglog、台账、标准随之更新） |

---

## 已知差异（无法通过本仓库同步）

| 项 | 说明 |
|---|---|
| 密钥/模型设置 | 每台机器独立，见第 4 步 |
| 系统代理 | 每台机器独立（GitHub 访问必需） |
| 用户目录路径 | profile 里 link/pythonPath 的绝对路径需按新机调整 |
| DSH 官方仓库版本 | 各机器可能停在各自升级时的版本；以版本台账为准，用 `更新DSH.bat` 对齐 |
