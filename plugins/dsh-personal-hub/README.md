# dsh-personal-hub

个人 DSH 配置器：把个人插件与配置覆盖收敛为一份声明式清单（唯一权威），官方 DSH 升级后按清单一键重建 web profile。遵循 [PLUGIN-STANDARD.md](../PLUGIN-STANDARD.md) 行为准则开发。

## 工作方式

- 共享清单：`<ops 根>/personal-hub/personal.json`（JSON，git 同步，**机器无关**）。只声明组合意图，字段：
  - `officialBundles[]` — 官方基底层（`dsh-base` + `dsh-web-app`），profile 的必需基座；
  - `plugins[]` — 自研插件（`name`，可选 `patch.config` / `patch.comment`）；
  - `extraBundles[]` — **非基座、非自研**的功能 bundle（官方可选/实验层，如 Agent Teams 的两个包）。按声明顺序排在自研插件**之后**——bundle 顺序决定 patch 层叠顺序，改动顺序等于改动覆盖结果；
  - `removedBundles[]` — 显式从 profile 剔除的 bundle（reapply 时移除）；
  - `extraPatches[]` — 非插件绑定的部署覆盖。

  **不写绝对路径**——`profileDir` 运行时派生（`$DSH_HOME` 或 `~/.dsh` + `profiles/web`），`pluginsDir` 从本插件自身所在仓库布局派生。
- 本机覆盖层：同目录 `personal.local.json`（**gitignore，每台机器自建**）。放机器特定的绝对路径（如 `tool-python` 的 `pythonPath`、`pwsh-sandbox` 的 `pwshPath`）与机器特有条目。合并语义：`plugins` 按 `name`、`extraPatches` 按 `id` 深合并，覆盖值优先；文件不存在则纯用共享清单 + 派生默认值。
- 三个模型工具：
  - `personal_hub_status` — 比对清单（合并后视图）与 profile 实况（dependencies / bundles / patch 条目），报告漂移；只读。
  - `personal_hub_validate` — 校验清单结构、插件目录在位、id 唯一、官方层与个人层无重名；只读。
  - `personal_hub_reapply` — 备份 → 按清单重写 `package.json`（dependencies + `dsh.profile.bundles`，**清单外 bundle 原样保留**）→ 重生成 `cordis.patch.yml` 的**托管条目**（官方/未知块逐字保留）→ profile 目录 `pnpm install` → 复检。不重启服务。
- 托管条目 id 约定：插件 = 包名去 `dsh-` 前缀（如 `dsh-tool-python` → `tool-python`）；部署覆盖用清单里显式的 `id`。
- 默认清单路径从插件目录推导（`<ops 根>/personal-hub/personal.json`）；可用本插件 config 的 `manifestPath` 覆盖。

## 与官方插件管理器的关系（0.1.6-alpha.2+）

官方在 0.1.6-alpha.2 引入浏览器内的插件管理器（侧边栏 Plugins 面板 / `plugin_manager` 工具），它能直接改本 profile 的 `dsh.profile.bundles`——**和清单同层**。两者的权威边界必须分清：

| 动作 | 归属 | 回写清单 |
|---|---|---|
| 声明式重建（官方升级后一键恢复个人层） | 本插件 | — |
| 装 / 卸 / 启用单个 bundle（GUI 交互） | 官方插件管理器 | **否** |

因此 reapply 的语义是**只补不删**：

- 清单声明、profile 缺失 → **补齐**（记为漂移）；
- profile 有、清单未声明 → **原样保留**，界面仅作提示，**不算漂移、不影响 `ok`**；
- 想真正移除 → 写进 `removedBundles`，或用 `disable-plugin.mjs`（顺带摘除 link，语义更完整）。

这条规则有实例支撑：2026-09-18 官方更新后，Agent Teams 的两个 bundle 被插件管理器写进 `dsh.profile.bundles`，而清单未同步——旧实现按"序列必须完全相等"判定，把它算成漂移，一次 reapply 就会**静默卸载 Agent Teams**（连带 `tool-agent-team` patch 行失去宿主）。现已把这两个包写进 `extraBundles`，并让 reapply 永不剪除清单外项。

同理，`cordis.patch.yml` 里的非托管条目（如 Agent Teams 自己写的 `tool-agent-team`）一直是被逐字保留的，现在它与"非清单 bundle"共用同一套提示通道（`notes`），不再把 `ok` 拖成 false——此前设置页在健康状态下也永远显示"漂移"，属于同一处语义混淆。

## 个人插件工具栏（已移交 dsh-personal-bar）

输入卡下方的个人胶囊行**已移交** [`dsh-personal-bar`](../dsh-personal-bar/README.md)——声明 `dsh.personal.bar` 子槽位、渲染 `.dsph-bar` 横排容器的现在是那个插件。

移出的原因：`slots.inject(slot, cb)` 在供应方缺席时会**静默跳过**消费者，既不报错也不留日志。容器原先由本插件的 browser half 顺带声明，于是本插件一旦被禁用或加载失败，Server-SSH、GitHub 推送、DeepSeek 余额三个胶囊会一起从界面消失，且无从排查。移交后本插件的故障域只剩自己的设置页。

消费方插件的注册方式**完全不变**（槽位名、id、order 与排序规则都没动），扩展方式、排序与换行约定见 [`dsh-personal-bar` 的 README](../dsh-personal-bar/README.md)。

## 个人部署层设置页（browser half）

浏览器半另外注册官方「设置 → 插件」分区的一页（`settings.plugins.tab`，id `personal-hub`，order 30）：显示清单漂移状态（无漂移 / 逐项漂移列表），并提供「重新检查」「一键重建」两个动作。

- **RPC 通道**：host 半在 `connection` 服务上注册包私有通道 `/dsh-personal-hub`，端点 `status` / `validate` / `reapply`，返回平台信封 `{ ok, value | error }`；`connection` 是可选服务（`ctx.get`），缺失时页面提示"连接服务尚未就绪"，模型工具不受影响。
- **异步安装**：`reapply` 内的 `pnpm install` 走**异步 `spawn`**（超时上限 `INSTALL_TIMEOUT_MS`），不再阻塞事件循环——否则点击「一键重建」会冻结整个服务（此前工具调用也有此问题，已一并修复）。
- 页面只渲染 host 返回的 JSON；所有决策与写入都在 host 半完成。

## 配置字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `manifestPath` | string | `<ops 根>/personal-hub/personal.json` | 声明清单的绝对路径 |

## 安装（三步）

1. profile `package.json` 的 `dependencies` 加：
   `"dsh-personal-hub": "link:E:/DSH/DSH-ops/plugins/dsh-personal-hub"`
2. `dsh.profile.bundles` 数组追加 `"dsh-personal-hub"`
3. profile 目录执行 `pnpm install`，然后重启服务（预检闸门自动运行）

首次安装后即由 `personal_hub_reapply` 接管后续安装/重适配（含 `pnpm install`）。

## 验证

- `node E:\DSH\Deepseek_DSH/apps/cli/lib/bin.js --profile web --dump-config` 出现 `id: personal-hub` 行
- 调用 `personal_hub_status`：清单与 profile 一致时报告"无漂移"
- 人为把一个插件从 profile `dependencies` 删除后 `personal_hub_status` 应报缺失，`personal_hub_reapply` 后恢复
- 离线断言（不需起服务、不会触发 pnpm install）：`index.js` 导出 `statusReport` / `validateManifest` / `declaredBundles`，可直接 `import` 后对真实清单与 profile 做比对

## 官方升级后的重适配流程

1. `update-dsh.ps1` 完成官方升级。
2. `personal_hub_validate` → 必须全绿（官方删包/改名会导致清单校验失败，先改清单）。
3. `personal_hub_reapply` → 备份并重建个人层。
4. 重启服务；`personal_hub_status` 复检无漂移。

## 已知边界

- 只管理 web profile 的三件套（`package.json`、`cordis.patch.yml`、`cordis.yml` 备份）；不触碰 `~/.dsh` 的 credentials 与 settings。
- `cordis.patch.yml` 解析按 `- id:` 行分块的受限形式；官方若改变该文件整体格式，托管条目仍会重生成，但非托管块保留依赖分块假设，reapply 前先看备份 diff。
- 不自动重启 DSH 服务；reapply 完成后需显式重启使新组合生效。
- 官方升级若引入新的 patch 默认行，`personal_hub_status` 会将其列为"非托管条目"供知悉，不会自动删除或改写。
- **清单不是 profile 的唯一写入方**：官方插件管理器可在 GUI 里改 `dsh.profile.bundles`。reapply 只补不删，所以"把某插件从清单里删掉"**不会**让它在 profile 里消失——必须写进 `removedBundles`，或用 `disable-plugin.mjs`。
