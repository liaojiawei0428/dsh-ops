# dsh-personal-bar

作曲器下方的「个人插件胶囊行」容器。它只做一件事：在官方 slot `conversation.composer.dock` 上注册一行，并声明加法子 slot `dsh.personal.bar`，供各个人插件把自己的胶囊注册进去。

遵循 [PLUGIN-STANDARD.md](../PLUGIN-STANDARD.md) 行为准则开发。

> **胶囊显示异常（消失 / 与官方挤在一起 / 位置不对）请先读 [`../PERSONAL-CAPSULES.md`](../PERSONAL-CAPSULES.md)** —— 那是胶囊行的位置、依赖链、官方更新脆弱点与逐症状修复步骤的唯一入口。

## 为什么单独成一个插件

`slots.inject(slot, cb)` 的语义是**响应式依赖**：只有当该 slot 的声明存在时 cb 才运行，声明消失时对应贡献被撤销。它的反面是——**供应方缺席时消费者被静默跳过，既不报错也不留痕**。

在拆分之前，这一行由 `dsh-personal-hub` 顺带提供，于是禁用或弄坏那个「设置页」插件，会连带让 Server-SSH、GitHub 推送、DeepSeek 余额三个胶囊从作曲器上消失，而日志里没有任何线索。把容器放进一个**职责单一到几乎不可能失败**的插件后，任何功能插件的故障都不再能带走别人的界面。

## 谁往这个容器里注册

| 插件 | 条目 id | order |
|---|---|---|
| dsh-server-ssh | `server-ssh` | 30 |
| dsh-github-push | `github-push` | 40 |
| dsh-deepseek-balance | `deepseek-balance` / `deepseek-balance-version` | 100 / 101 |

这三个插件用 `slots.inject('dsh.personal.bar', …)` 注册，因此**依赖本插件在组合中存在**。禁用本插件会让它们的胶囊一并消失（这是 slot 依赖的固有语义，不是缺陷）。

### 排序、换行与接入约定

- **扩展方式**（任何自研插件，无需改本插件或官方代码）：
  ```js
  slots.inject('dsh.personal.bar', () => slots.register(
    { name: 'dsh.personal.bar', id: '<唯一 id>', order: <数字> },
    YourCapsule,
  ))
  ```
- **排序**：官方 list 语义按 `order` **升序**（`Array.prototype.sort` 稳定，`order` 相同则保持注册顺序）。当前占用：`server-ssh` 30、`github-push` 40、`deepseek-balance` 100、`deepseek-balance-version` 101；负数可插到最前。
- **换行（支持无限扩展）**：容器自身带 `display:flex; flex-wrap:wrap; justify-content:center`，胶囊放不下时**自动折到下一行、且每一行都居中**，不会溢出或堆叠成列；容器在 dock 里仍以 `flex: 0 1 100%` 独占一整行，因此折成几行都不会挤回官方那行。**新增插件不需要改动任何 CSS。**
- **接入约定**：新插件取 `order` 时在现有区间外选值（如 10/20/110+），避免与既有条目同值（同值虽可稳定排序，但顺序取决于加载顺序，不便预测）。

## 工作方式

1. `client.js` 在官方 `conversation.composer.dock` 上注册 id 为 `personal-bar`、order 50 的条目，并在 `children` 中声明 `dsh.personal.bar`（`kind: 'list'`，`scope: 'session'`）。
2. 条目组件渲染一个 `.dsph-bar` 容器并 `renderSlot('dsh.personal.bar')` 把子条目横向排开；`:empty` 时整行隐藏。
3. **独占一行**：官方 `conversation.composer.dock` 的宿主 `.dock`（`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css`）是 **nowrap** 的横向 flex，官方的 stats 胶囊、本行与 ContextMeter 会挤在同一行。插件侧无法选择父元素（`:has()` 方案经实测在该浏览器不生效），因此改为**给官方 `.dock` 打补丁加 `flex-wrap: wrap`**（见 `official-patches/apply-patches.mjs`），再由本插件的 `order: 999; flex: 0 1 100%` 让本行占满一整行并排到官方条目之后——官方 stats 与 ContextMeter 留在上一行，个人胶囊独占下一行。`flex-shrink` 保持 1 是刻意的兜底：补丁若失效，本行退回共享行而不是溢出容器。
4. **改 CSS 后必须重建，验证前必须刷新**：本插件是手写 client bundle，`client.js` 由服务直接提供；但**官方侧**的 CSS 改动（上面那条补丁）必须 `pnpm run build` 才会进 `packages/client/ui-conversation/lib/client.js`（类名形如 `<hash>_dock`）。且**重启服务不会刷新浏览器已加载的 bundle**——验证任何 client 侧改动前都要刷新页面，否则看到的是旧 bundle。
5. 样式以 `data-plugin="dsh-personal-bar"` 标记注入，卸载时随 `ctx.effect` 一并移除。

宿主半 `index.js` 是占位，不注册任何东西。

## 安装（三步）

1. profile `package.json` 的 `dependencies` 加：
   `"dsh-personal-bar": "link:E:/DSH/DSH-ops/plugins/dsh-personal-bar"`
2. `dsh.profile.bundles` 数组追加 `"dsh-personal-bar"`（或写进 `personal-hub/personal.json` 的 `plugins` 清单后 `personal_hub_reapply`）
3. profile 目录执行 `pnpm install`，然后重启服务（预检闸门自动运行）

## 验证

- `node E:\DSH\DSH-ops\validate-plugins.mjs` 出现 `PASS dsh-personal-bar`
- `node E:\DSH\DSH-ops\Deepseek_DSH\apps\cli\lib\bin.js --profile web --dump-config` 出现 `id: personal-bar` 行
- 客户端 Slot 树中 `conversation.composer.dock` 的 occupant 含 `personal-bar`(order 50)，且 `dsh.personal.bar` 下仍有 server-ssh / github-push / deepseek-balance 四个 occupant
- 界面：作曲器下方一行三个胶囊，与拆分前视觉一致

## 已知边界

- 只注册容器与子 slot，不认识也不渲染任何具体胶囊。
- 不提供任何 host 侧能力、工具或 RPC。
- 是三个消费者插件的**硬依赖**；禁用本插件等于让它们的胶囊消失。
