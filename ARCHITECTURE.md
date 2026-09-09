# DSH 部署架构（2026-09 分离版）

## 目录结构

```
E:\DSH\                          （工作区根，不是 git 仓库）
├── Deepseek_DSH\                官方 checkout —— 纯净官方，只拉取跟随一致性
│                                   （git remote = deepseek-ai/deepseek-harness）
│                                   （源码永不手改；update-dsh.ps1 只做 fetch/pull/build）
└── DSH-ops\                     个人部署仓库（git remote = liaojiawei0428/dsh-ops）
    ├── Deepseek_DSH\            个人运行副本（.gitignore 排除，不入个人 git）
    │                               （独立 node_modules + 本地补丁，服务运行源）
    ├── plugins\                 自研插件（link 安装到 profile）
    ├── personal-hub\            个人层清单（personal.json）
    ├── official-patches\        官方补丁（apply-patches.mjs 精确文本替换）
    ├── scripts（update-dsh.ps1 / start-dsh-web.ps1 / sync-official.ps1
    │             / bootstrap-personal.ps1 / watchdog-dsh.ps1 …）
    └── buglog\                  已知问题与修复记录（git 版本化）
```

## 职责边界

| 目录 | 角色 | 谁改 | 更新方式 |
|---|---|---|---|
| `E:\DSH\Deepseek_DSH` | 官方源码源 | 官方 | `update-dsh.ps1` 拉取并构建 |
| `DSH-ops\Deepseek_DSH` | **运行源** | 个人（补丁） | `sync-official.ps1` 从官方增量同步 + 应用补丁 |
| `DSH-ops` 其余 | 个人配置 | 个人 | git 推 GitHub |

## 关键机制

### 1. 服务运行源 = 个人副本
`start-dsh-web.ps1` 的 `$repo` 指向 `DSH-ops\Deepseek_DSH`（副本），服务从这里启动。
官方目录只做拉取/构建源，**永不直接运行服务**（避免其源码被个人修改污染）。

### 2. 补丁管理（official-patches/）
官方 checkout 永远纯净。个人修复以**精确文本替换**形式保存在 `apply-patches.mjs`，
每次同步后对副本源码应用，再在副本构建 → 产物天然带补丁。

当前补丁（随官方版本演进维护，官方合入后可移除）：
| 补丁 | 原因 | 官方文件 |
|---|---|---|
| `connection rpc.handle 崩溃修复` | 0.1.3-alpha.2 connection 懒注入漏改 `owner.webServer`；官方未合入 | `packages/client/connection/src/rpc-host.ts` |
| `session descriptor v2 兼容` | SESSION_FORMAT_VERSION=3 后 v2→v3 迁移链拒绝 released descriptor v2（7 个历史会话） | `packages/session/session-format-v0-to-v1/src/payload-validation.ts` |

应用失败会 fail-loud（目标文本出现次数 ≠ 1 时），不会静默漏补。
官方升级若改动同一处代码，需人工核对补丁后重新生成。

### 3. 更新流程（update-dsh.ps1）
```
fetch → pull 官方（官方目录须干净，本地修改自动 stash/恢复）
→ pnpm install → pnpm build（官方目录构建）
→ sync-official.ps1（官方源码增量同步到副本 + 应用补丁 + 副本构建）
→ 版本确认 / profile 预检 / 重启（均以副本为准）
```

### 4. 新电脑部署（bootstrap-personal.ps1）
```
git clone 个人仓库（DSH-ops）
pwsh -File bootstrap-personal.ps1
   1. clone 官方到 DSH-ops\Deepseek_DSH（--depth 1）
   2. pnpm install（副本依赖，约 3-4 分钟）
   3. 应用官方补丁（apply-patches.mjs）
   4. pnpm run build（副本构建）
→ 服务从副本启动；日常更新走 update-dsh.ps1
```

## 配置文件（不进 git）

- `~/.dsh/settings.yaml`、`~/.dsh/.credentials.yaml`（含密钥，本机）
- `personal-hub/personal.local.json`（机器特定覆盖）
- GitHub PAT（`~/.dsh/github-push/credentials.json`）

## 版本台账

`version-history.md` 由 update-dsh.ps1 自动追加。