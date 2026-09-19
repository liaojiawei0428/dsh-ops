# dsh-computer-use

把官方 **computer use（计算机操作）** 能力挂载到本机 profile 的装载器插件。它自身不含运行时代码，作用全在 `cordis.patch.yml`。

## 工作方式

`cordis.patch.yml` 向组合插入两行：

| 行 id | 包 | 作用 |
|---|---|---|
| `computer-use` | `@deepseek-ai/dsh-computer-use` | 排他的提供方注册位（`ctx.computerUse`） |
| `computer-use-cua-driver-native` | `@deepseek-ai/dsh-experimental-computer-use-cua-driver-native` | 通过 npm 依赖 `@trycua/cua-driver@0.28.0` 在 DSH 主机进程内运行 Cua Driver，暴露上游工具目录（`cua_driver_native__*`） |

为什么必须由插件携带：启用这两行是 **insert** 语义（官方没有任何随附 bundle 挂载它们，它们是显式 opt-in），而 personal-hub 清单的 patch 条目只能**覆盖已存在的行 id**，无法新增行。因此启用动作只能落在 bundle patch 里，再由清单把本插件放进 `dsh.profile.bundles`。

## 配置

本插件无配置字段。原生提供方同样无配置字段；它加载 package.json 声明的确切上游版本并采用其进程内默认配置。

需要换成"已安装 CLI"的 MCP 提供方时，改 `cordis.patch.yml` 的第二行（把包名换成 `@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp` 并加 `config: { command: cua-driver, args: [mcp] }`），**不要新增第三行**——同一次组合只允许一个提供方注册，第二个注册会激活失败。

## 安装

本插件由 dsh-personal-hub 清单管理，正常路径是把它加进 `personal-hub/personal.json` 的 `plugins` 数组，然后 `personal_hub_reapply`。手工等价三步：

1. profile `package.json` 的 `dependencies` 加 `"dsh-computer-use": "link:E:/DSH/DSH-ops/plugins/dsh-computer-use"`
2. `dsh.profile.bundles` 追加 `"dsh-computer-use"`
3. profile 目录 `pnpm install`，然后重启服务

## 验证

- `validate-plugins.mjs` 全绿（本插件在 bundles 内，闸门会执行它的 `apply`）
- 重启后新会话的工具列表出现 `cua_driver_native__*` 系列（上游目录动态发现）
- `cua_driver_native__check_permissions` 返回权限状态

## 已知边界

- 只读演练优先：先 `check_permissions` + `list_windows`，确认真实桌面可达再动手
- 上游是实验性软件包，工具 schema 跟随锁定的 SDK 版本，不作稳定性承诺
- 原生提供方与 DSH 主机共享进程，原生崩溃可能带走主进程；需要独立权限归属时改用 MCP 提供方
- Windows 上运行时必须是交互式会话（Session 1+）；Session 0 下 UIA 枚举与截图静默返回空
- 桌面是共享资源：并发会话不会串行化操作，调用方自行协调
