---
date: "2026-09-18T09:23:46.844Z"
symptom: "官方 0.1.6-alpha.2 更新后，personal_hub_status 恒报\"漂移 2 项\"：其中 bundles 差异是用户在新版插件管理器 GUI 里启用的 Agent Teams 两个 bundle；此时执行 personal_hub_reapply 会静默卸载 Agent Teams"
component: "dsh-personal-hub"
severity: "major"
status: "fixed"
root_cause: "dsh-personal-hub 把 web profile 的 bundles 当成清单独占：statusReport 用 JSON 序列严格相等判定漂移，reapply 用 [...officialBundles, ...plugins] 整段覆盖 dsh.profile.bundles。而 0.1.6-alpha.2 新增的官方插件管理器能在同一层写入 bundles 且不回写清单，于是 GUI 里启用/安装的任何 bundle 都会被记为漂移、并在下一次 reapply 被静默卸载（实测：用户在 GUI 启用 Agent Teams 的两个 bundle，一次 reapply 即会删除它们）。次生问题：cordis.patch.yml 的非托管条目被塞进 drift 数组，而 ok = (drift.length===0)，导致健康 profile 也恒显示\"漂移\"。"
fix: "index.js 新增 declaredBundles() 统一层叠序；statusReport 拆 drift/notes 双通道（缺清单项才算漂移，清单外 bundle 与非托管 patch 条目只提示）；reapply 改为\"清单项 + 保留的清单外项（排除 removedBundles）\"；personal.json 新增 extraBundles（收纳 Agent Teams 两个包）与 removedBundles；validateManifest 校验新字段并做交叉一致性检查；client.js 渲染 notes；index.js 导出 statusReport/validateManifest/declaredBundles 供离线断言；README 新增「与官方插件管理器的关系」一节"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\README.md"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\package.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
---

## 发现路径
用户问"我的插件是否需要重新适配现在的这个插件管理？例如个人部署层"。查 `personal_hub_status` 得到"漂移 2 项"，其中 bundles 差异指向两个非清单项：`@deepseek-ai/dsh-experimental-agent-team-profile` / `...-web-profile`。用 `plugin_manager list_bundles` 确认二者是 `installed:false` 的官方内置包（与 dsh-base 同性质，不需 profile dependency）。时间线证据：`backups/` 里 09-18 10:10 的 `2026-09-18T02-22-27-057Z-personal-hub/package.json` = n12 且无 team，而 `web/package.json`(mtime 17:14:46) 与 `cordis.patch.yml`(17:14:38) 相差 8 秒被改成 n15 —— 典型的"在 GUI 插件管理器里启用 bundle"动作（新功能）。即：**Agent Teams 是用户用新版插件管理器启用的，清单不知道它**。

## 根因（两处，同源）
1. `index.js:547` 的 `statusReport` 用 `JSON.stringify(liveBundles) !== JSON.stringify(expectedBundles)` 做**严格序列相等**判定；`index.js:654` 的 `reapply` 又用 `[...officialBundles, ...plugins.map(name)]` **整段覆盖** `dsh.profile.bundles`。二者都把 profile 当成"清单独占"，而 0.1.6-alpha.2 新增的官方插件管理器可在**同一层**写入 bundles，且**不回写清单**。后果：GUI 里装/启用的任何 bundle 都会被记为漂移，并在下一次 reapply 被静默卸载（Agent Teams 会连 `tool-agent-team` patch 行一起失去宿主）。
2. patch 层的非托管条目（`tool-agent-team`）被 `drift.push(...)` 计入，而 `ok = drift.length === 0` —— 于是**健康 profile 的设置页永远显示"漂移"**，与"不计为错误"的措辞自相矛盾。（措辞与实现不一致，非本次新引入。）

## 修复
- 新增 `declaredBundles(manifest)` 统一定义层叠序：`officialBundles → plugins → extraBundles`（顺序即 patch 层叠顺序，必须有唯一定义处）。
- `statusReport` 拆双通道：**缺清单项 = `drift`**（影响 ok）；**清单外 bundle / 非托管 patch 条目 = `notes`**（保留、不计错误、不影响 ok）。
- `reapply` 改为"清单项 + 保留的清单外项（排除 `removedBundles`）"，并在 actions 里明示保留了几项、移除了哪些。
- 清单新增两个对称字段：`extraBundles[]`（收纳官方可选/实验层，已写入 Agent Teams 两包）、`removedBundles[]`（显式剔除，替代"靠覆盖删除"的隐式语义）。
- `validateManifest` 校验两新字段类型，并加交叉一致性：同一 bundle 不得同时出现在 officialBundles/plugins/extraBundles，也不得既声明又在 removedBundles。
- `client.js` 渲染 `notes`。
- `index.js` 末尾导出 `statusReport` / `validateManifest` / `declaredBundles`（import 不执行 apply），用于离线断言。

## 验证（实测，非推断）
临时脚本 `import` 插件模块直接对**真实清单 + 真实 profile** 断言，随后删除脚本：
- `validate.ok = true`（新字段通过校验）
- `status.ok = true`，`drift = []`，`notes = ["cordis.patch.yml 存在非托管条目 id tool-agent-team（保留，不计为错误，仅供知悉）"]`
- `reapply 后 bundles 不变 = true` —— 声明顺序与现况**逐字节一致**，说明修复零副作用、不改变 patch 层叠结果
- `Agent Teams 是否进入清单 = true`
- `node validate-plugins.mjs` 全绿（11 个活跃插件）；`node --check` 两个文件语法通过；`personal.json` JSON 合法

## 注意
运行期仍是旧代码（HMR 未重载 host 侧），必须重启服务后新逻辑才生效；在重启前于 GUI 点"一键重建"仍会按旧语义删掉 Agent Teams。

## 遗留
`statusReport` 已导出，但仍无自动化测试文件覆盖这条 bundles/notes 语义；目前只有一次性离线断言。
