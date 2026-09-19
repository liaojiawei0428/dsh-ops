# 个人插件胶囊行（Personal Capsule Bar）

> **给后续 AI / 维护者**：这份文档说明个人插件胶囊的**位置**、与官方元素的**区分方式**、**依赖链**、官方更新时的**脆弱点**，以及**坏掉后的诊断与修复步骤**。胶囊显示一旦异常，先读本文再动手。

## 1. 它长什么样、在哪

视觉上它位于**作曲器（输入框）正下方**，独占一整行：

```
        …会话消息…
        ┌──────────────────────────────────┐
        │           输入框                  │
        └──────────────────────────────────┘
        [官方 stats]  [ContextMeter]           ← 官方那行
        [SSH] [GitHub] [余额] [DSH版本]         ← 个人胶囊行（本文档的主角）
```

**与官方元素如何区分**（这是最容易混淆的地方）：

| | 官方那行 | 个人胶囊行 |
|---|---|---|
| 内容 | `@deepseek-ai/dsh-client-ui-chat` 注册的 stats 胶囊 + **硬编码**的 `ContextMeter` | `.dsph-bar` 容器里的 4 个胶囊 |
| 归属 | 官方包，随官方更新变化 | 自研插件 `dsh-personal-bar` + 3 个消费者插件 |
| 识别特征 | 显示 turns/steps/token 统计、上下文占用 | 依次是 `SSH`、`GitHub`、`DeepSeek 余额`、`DSH版本号：x.y.z` |

**两者在同一个官方 slot 里**（`conversation.composer.dock`），靠容器换行分成了上下两行——不是两个不同的 slot。

## 2. 组成与依赖链（关键，坏了先看这里）

```
官方 slot: conversation.composer.dock          ← 官方 ui-conversation 的 InputBar 渲染
   ├── stats                (order 0)          ← 官方 @deepseek-ai/dsh-client-ui-chat
   ├── personal-bar         (order 50)         ← 自研 dsh-personal-bar ★ 容器（本行）
   │      └─ 声明子 slot: dsh.personal.bar
   │            ├── server-ssh                (30)   ← dsh-server-ssh
   │            ├── github-push               (40)   ← dsh-github-push
   │            ├── deepseek-balance         (100)   ← dsh-deepseek-balance
   │            └── deepseek-balance-version (101)   ← dsh-deepseek-balance
   └── ContextMeter                            ← 官方**硬编码**在 dock 里，不是 slot 条目
```

要点：

- **`dsh-personal-bar` 是唯一提供容器的插件**。它只做这一件事（`index.js` 是空占位），存在意义就是「让容器不属于任何功能插件」，从而隔离故障域。
- 另外三个插件用 `slots.inject('dsh.personal.bar', …)` 注册。**该 API 的语义是「slot 存在才注册，不存在不报错」**——所以禁用 `dsh-personal-bar` 会让这三个胶囊**静默消失**，日志无任何提示。
- `dsh-personal-hub`（设置页）**已不参与**本行（2026-09-18 拆分，原因见 §6）。

### 继续扩展：新插件加入本行

**可以，这正是本行的设计目的**：容器只负责「提供位置 + 声明子 slot」，不关心谁往里注册。新插件按下面约定注册即可：

```js
exports.inject = ['slots']              // 必须：否则 slots 未就绪时 apply 会静默退出（见 §6）
function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) {
    console.warn('[your-plugin] slots unavailable; capsule not registered')
    return
  }
  slots.inject('dsh.personal.bar', () => slots.register(
    { name: 'dsh.personal.bar', id: '<唯一 id>', order: <数字> },
    YourCapsule,
  ))
}
```

**满一行后会自动折到下一行**。容器 `.dsph-bar` 自身带 `flex-wrap: wrap` 与 `justify-content: center`，胶囊超出可用宽度时自动换行，且**每一行都居中**：

```
[SSH] [GitHub] [余额] [DSH版本]
[新胶囊1] [新胶囊2]
```

行内与行间距由容器的 `gap: 8px` 统一控制；容器整体在 dock 里仍独占一整行（`flex: 0 1 100%`），所以无论折成几行都不会挤到官方那行去。

**扩展时的四条约定**：

1. **`id` 必须唯一** —— list slot 里**重复 id 会互相遮蔽**（后注册的替换同 id 的先前条目），这是静默的
2. **`order` 取既有区间外的值** —— 当前占用 `30` / `40` / `100` / `101`；建议 `10`/`20`/`110+`，负数可插到最前
3. **必须声明 `exports.inject = ['slots']`** —— 见 §6 的 2026-08-28 事故
4. **依赖 `dsh-personal-bar` 在组合中存在** —— 禁用容器会让所有胶囊静默消失

**无需改动的**：容器 CSS（多行是自动行为）、dock 的 `flex-wrap` 补丁、其它已有插件。
**需要做的**：把新插件加进 `personal-hub/personal.json` 清单 → `personal_hub_reapply` → 重启 → **刷新页面**。

## 3. 「独占一行」是怎么实现的（两个位置缺一不可）

| 位置 | 内容 | 为什么必须 |
|---|---|---|
| 官方 `packages/client/ui-conversation/src/client/skeleton/InputBar.module.css` 的 `.dock` | 经 `official-patches` 补丁插入 `flex-wrap: wrap;` | 该容器默认 `display:flex` + **nowrap**；不换行则所有条目（官方 stats、个人胶囊行、ContextMeter）全挤在一行 |
| `plugins/dsh-personal-bar/client.js` 的 `.dsph-bar` | `order: 999; flex: 0 1 100%` | `flex-basis:100%` 在允许换行的容器里必定独占一整行；`order` 更大使其排在官方条目之后（官方留在上一行） |

**为什么不能只靠插件 CSS**：CSS 无法选择父元素。曾用 `div:has(> .dsph-bar) { flex-wrap: wrap }` 尝试从插件侧改容器，**实测在该浏览器不生效**（原因未查明：插件 CSS 确实注入了，DOM 结构也确认是直接子元素）。最终只能给容器本身打补丁。

**兜底设计**：`.dsph-bar` 的 `flex-shrink` 保持 `1`。若官方补丁失效，本行会退回「与官方共享一行」的旧状，而**不会**溢出容器。

## 4. 官方更新时会发生什么

`update-dsh.ps1` / `sync-official.ps1` 的流程：

```
git pull（官方 checkout）
  → pnpm install / build
  → robocopy 覆盖运行副本 E:\DSH\DSH-ops\Deepseek_DSH
  → 删除「官方 checkout 中不存在」的残留文件
  → apply-patches.mjs（15 条精确替换 + 7 条文件恢复）
  → profile 组合校验 + 插件闸门
  → 重启服务
```

**会自动保留**：

- `official-patches/apply-patches.mjs` 的全部 **15 条替换**——包括 `.dock` 的 `flex-wrap: wrap` 补丁
- **7 条恢复**（Agent Note 三件套、`config-catalog` 英/中/i18n、`llm-pi-ai` README i18n）

**不会被碰**：

- `plugins/` 下的自研插件源码（在 DSH-ops 仓库里，不在运行副本内）
- profile 配置（`bundles` / `cordis.patch.yml`，由 `personal-hub/personal.json` 清单 + `personal_hub_reapply` 管理）
- `~/.dsh/settings.yaml`

**可能坏掉的两种情况**：

| 情况 | 表现 | 处理 |
|---|---|---|
| 官方改写了 `.dock` 那段 CSS 文本 | `apply-patches.mjs` **fail-loud**：报「目标文本出现 N 次（期望 1 次）」，更新中断、旧服务继续跑 | 按官方新文本重取锚点，更新 `apply-patches.mjs` 的 `old`/`new`（§5 症状 A 第 3 步） |
| 官方改了 slot 渲染结构或 `conversation.composer.dock` 的宿主 | 补丁仍能应用，但胶囊可能又同行、或整行消失 | 按 §5 逐项诊断 |

## 5. 坏了怎么修

> 通用前提：**改了 client 侧任何东西（官方 CSS 或插件 client.js）后，必须 `pnpm run build` 重建 bundle，并且必须刷新浏览器页面**。重启 DSH 服务**不会**让浏览器重新加载 client bundle——这是最容易误判「修了没用」的坑。

### 症状 A：胶囊与官方挤在同一行

1. **查产物里补丁是否生效**：
   ```powershell
   Select-String -Path 'E:\DSH\DSH-ops\Deepseek_DSH\packages\client\ui-conversation\lib\client.js' -Pattern 'flex-wrap'
   ```
   期望看到形如 `.fAdZpG_dock{flex-wrap:wrap;…}`。**注意 CSS Modules 编译后的类名格式是 `<hash>_dock`，不是 `_dock_<hash>`**（用错正则会误判「CSS 没进产物」）。
2. 产物里**没有** → 源码改了但没构建：在运行副本执行 `pnpm run build`，然后刷新页面。
3. 产物里**有**但仍同行 → 浏览器仍是旧 bundle：强制刷新（Ctrl+R）；仍不行则查源码锚点是否匹配官方新文本（见第 4 节表格第一行）。
4. 检查补丁源文件本身：`packages/client/ui-conversation/src/client/skeleton/InputBar.module.css` 的 `.dock` 是否含 `flex-wrap: wrap;`。

### 症状 B：整行胶囊消失（4 个都不见）

按顺序查，任一步失败就地修复：

1. **插件闸门**：`node E:\DSH\DSH-ops\validate-plugins.mjs` → 应有 `PASS dsh-personal-bar`
2. **是否被装上**：`personal_hub_status`（工具或 `node E:\DSH\DSH-ops\...`）→ 应无漂移，且清单含 11 个插件
   或直接看 profile：`C:\Users\Administrator\.dsh\profiles\web\package.json` 的 `dsh.profile.bundles` 应含 `dsh-personal-bar`
3. **容器条目是否注册**：
   ```
   cordis_inspect_query  platform=client provider=Slots method=listSubTree
   input={"root":"conversation.composer.dock"}
   ```
   occupants 应含 `personal-bar`(order 50, active:true)
4. **子条目是否注册**：同法查 `{"root":"dsh.personal.bar"}`，应有 4 个 occupant：
   `server-ssh`(30)、`github-push`(40)、`deepseek-balance`(100)、`deepseek-balance-version`(101)

### 症状 C：只有部分胶囊消失

容器在、子条目缺 → 问题在**对应插件自己**：

- 查该插件的 `client.js` 是否声明了 `exports.inject = ['slots']`（缺了会在 slots 服务就绪前执行 apply 并静默退出——2026-08-28 的真实事故）
- 查其 `apply` 里的 `slots.inject('dsh.personal.bar', …)` 的 id 是否与他人**撞车**（slot 的 list 语义里，**重复 id 会互相遮蔽**）
- 查 order 是否落在既有区间外（约定见 `plugins/dsh-personal-bar/README.md`）

## 6. 已知故障模式（历史记录，全部已修）

| 日期 | 症状 | 根因 | buglog |
|---|---|---|---|
| 2026-08-20 | 点击版本胶囊 → **DSH 服务进程崩溃** | `spawn` 目标路径不存在且无 `error` 监听器，ENOENT 升级为 uncaughtException | `2026-08-20-balance-capsule-click-crash` |
| 2026-08-28 | 余额与版本两个胶囊**消失** | `client.js` 缺 `exports.inject = ['slots']`；0.1.2 改并发激活后暴露，`ctx.get('slots')` 为 undefined 时静默 return | `2026-08-28-client-capsule-missing-inject-decl` |
| 2026-09-18 | 胶囊与官方 stats/ContextMeter **挤在同一行** | 宿主 `.dock` 是 nowrap 横向 flex，`width:100%` 只被 shrink | `2026-09-18-composer-dock-capsule-same-row` |
| 2026-09-18 | 三个胶囊有**静默失效风险** | 容器原由 `dsh-personal-hub` 顺带声明；`slots.inject` 在供应方缺席时不报错 | `2026-09-18-personal-bar-implicit-slot-dependency` |

检索：`bug_search` 工具（关键词 `capsule` / `personal-bar` / `composer-dock`），或读 `E:\DSH\DSH-ops\buglog\INDEX.md`。

## 7. 快速自检清单

```powershell
# 1. 插件闸门（应 PASS dsh-personal-bar，且 all 11 active linked plugin(s)）
node E:\DSH\DSH-ops\validate-plugins.mjs

# 2. 补丁是否在册（应含 InputBar.module.css 与 harnessSessionHeader 等）
Select-String -Path E:\DSH\DSH-ops\official-patches\apply-patches.mjs -Pattern 'InputBar.module.css'

# 3. 构建产物是否含换行补丁（应含 flex-wrap:wrap 的 <hash>_dock 规则）
Select-String -Path E:\DSH\DSH-ops\Deepseek_DSH\packages\client\ui-conversation\lib\client.js -Pattern 'flex-wrap'

# 4. 运行副本源码是否已含补丁效果（应含 flex-wrap: wrap）
Select-String -Path E:\DSH\DSH-ops\Deepseek_DSH\packages\client\ui-conversation\src\client\skeleton\InputBar.module.css -Pattern 'flex-wrap'

# 4b. 补丁是否仍可在下一次官方更新时重放（用纯净官方源试跑，不写任何文件）
#     注意：纯净官方源本身不含 flex-wrap —— 那是补丁加上的，所以第 4 步查的是运行副本。
#     试跑：把补丁涉及的 9 个文件从 E:\DSH\Deepseek_DSH 复制到临时目录，
#     执行 node official-patches\apply-patches.mjs <临时目录>\packages，应与运行副本逐字节一致。

# 5. 全机体检
E:\DSH\DSH-ops\health-check.cmd
```

**永远记住**：任何 client 侧改动之后 —— ① `pnpm run build` ② **刷新浏览器页面** ③ 再判断效果。

## 8. 相关文件

| 文件 | 作用 |
|---|---|
| `plugins/dsh-personal-bar/client.js` | 容器实现：注册 `personal-bar` 条目、声明 `dsh.personal.bar`、注入 `.dsph-bar` 样式 |
| `plugins/dsh-personal-bar/README.md` | 插件级说明：职责、排序与接入约定 |
| `plugins/dsh-personal-hub/client.js` | **已不含**容器；只拥有设置页 |
| `official-patches/apply-patches.mjs` | 15 条官方源码替换 + 7 条文件恢复；`.dock` 的 `flex-wrap` 补丁在此 |
| `Deepseek_DSH/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css` | 官方 `.dock` 规则所在（补丁落点） |
| `personal-hub/personal.json` | 个人插件清单（11 个），`personal_hub_reapply` 据此重建 profile |
