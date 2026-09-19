---
date: "2026-09-18T02:23:45.098Z"
symptom: "四个个人插件的 UI 条目共享一个由其中之一的 client 半创建的自定义 slot `dsh.personal.bar`；若创建方（dsh-personal-hub）缺席，另外三个（server-ssh、github-push、deepseek-balance）会静默停止注册，界面无提示、日志无错误。"
component: "dsh-personal-bar / dsh-personal-hub"
severity: "minor"
status: "fixed"
root_cause: "dsh-personal-hub 的 client 半在注册自己的 conversation.composer.dock 条目时，顺带把 dsh.personal.bar 声明为该条目的 child slot；server-ssh、github-push、deepseek-balance 三个插件把各自的 UI 条目注册进这个由另一个插件创建的 slot。而 slots.inject(name, cb) 只在 slot 已存在时执行 cb，slot 缺失既不注册也不报错，于是供应方一旦缺席，消费方全部静默消失。根因是**容器职责的归属错配**：一个功能插件（设置页）顺带提供了别人赖以存在的布局容器。"
fix: "新增 dsh-personal-bar 插件（通过脚手架创建）承载容器职责：在官方 conversation.composer.dock 注册 id=personal-bar、order=50 的条目，声明子 slot dsh.personal.bar，并注入与原实现逐字相同的 .dsph-bar 样式。dsh-personal-hub 的 client 半移除全部容器代码（常量、CSS、PersonalBar 组件、注册块），只保留设置页。personal.json 清单加入新插件并 reapply。三个消费者插件无需改动。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-bar\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-bar\\package.json"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-bar\\README.md"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\client.js"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
---

实施（2026-09-18）：

1) 用准则脚手架 `node E:\DSH\DSH-ops\new-plugin.mjs dsh-personal-bar` 建骨架（package.json / cordis.patch.yml / index.js / README.md），再补 `dsh.client` 声明与 `./client` export。

2) 新插件 client.js 承载容器：常量 HOST_SLOT='conversation.composer.dock'、BAR_SLOT='dsh.personal.bar'；CSS 只含 `.dsph-bar` 与 `.dsph-bar:empty` 两条（**逐字沿用原规则**，class 名不变）；组件 PersonalBar 不变；apply 里 `slots.inject(HOST_SLOT, () => slots.register({ name: HOST_SLOT, id: 'personal-bar', order: 50, children: { [BAR_SLOT]: { kind:'list', scope:'session' } } }, PersonalBar))`，id 与 order 均保持不变。宿主半 index.js 为 client-only 占位。

3) 从 dsh-personal-hub/client.js 移除容器职责（6 处精确编辑，残留检查全部清零）：头部注释、HOST_SLOT/BAR_SLOT 常量、CSS 中两条 .dsph-bar 规则、PersonalBar 组件（含 JSDoc）、apply 中的 slots.inject(HOST_SLOT,…) 注册块、apply 的入口注释。personal-hub 现在只拥有 settings.plugins.tab 上的设置页与其余 .dsph-* 样式。

4) personal.json 的 plugins 列表在 personal-hub 之后插入 {"name":"dsh-personal-bar"}（11 个插件），personal_hub_reapply 重建 profile（备份 C:\Users\Administrator\.dsh\backups\2026-09-18T02-22-27-057Z-personal-hub）。

验证（全部实测）：
- validate-plugins：`PASS dsh-personal-bar: loads, apply() registers [(no tools)], schemas valid`，11 个 linked plugin 全绿（改动前是 10 个）。
- personal_hub_status：无漂移。
- health-check：全绿，13 bundles（官方 2 + 自研 11），回归 4/4。
- Slot 树逐项对照（重启后）：
  - `conversation.composer.dock` occupants = stats(0) + personal-bar(50)，均 active — 与拆分前一致；
  - `dsh.personal.bar` occupants = server-ssh(30) + github-push(40) + deepseek-balance(100) + deepseek-balance-version(101)，均 active — 与拆分前一致；
  - `settings.plugins.tab` occupants = all(10) + plugin-guide-zh(20) + personal-hub(30)，均 active — 设置页未受拆分影响。
- 视觉：class 名、CSS 规则、id、order 全部逐字保留，渲染结果与拆分前相同。

关键性质：三个消费者（server-ssh / github-push / deepseek-balance）的代码**无需任何改动**——它们注册的 slot 名 `dsh.personal.bar` 未变，只是供应方从「功能插件 personal-hub」换成了「专用容器插件 personal-bar」。此后 personal-hub 被禁用或加载失败，不再影响这三个胶囊。

故障隔离如何独立复现：在 profile 的 dsh.profile.bundles 里临时移除 dsh-personal-hub（或 `node disable-plugin.mjs dsh-personal-hub`）→ 重启 → 查 Slot 树 `dsh.personal.bar` 的四个 occupant 应仍全部 active，而 `settings.plugins.tab` 只剩 all 与 plugin-guide-zh。拆分前做同样操作会让 server-ssh / github-push / deepseek-balance 三个胶囊从 Slot 树中消失且日志无记录。
