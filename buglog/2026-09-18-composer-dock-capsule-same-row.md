---
date: "2026-09-18T08:54:25.421Z"
symptom: "作曲器下方的个人插件胶囊行与官方的 stats 胶囊、ContextMeter 挤在同一行，视觉杂乱且分不清归属；用户要求个人胶囊独占一整行且位置保持在输入框下方。"
component: "dsh-personal-bar / official-patches"
severity: "minor"
status: "fixed"
root_cause: "官方 conversation.composer.dock 的宿主容器 .dock（packages/client/ui-conversation/src/client/skeleton/InputBar.module.css）是 display:flex 且未声明 flex-wrap（默认 nowrap），同一行并排放着三样东西：官方 ui-chat 注册的 stats 胶囊(order 0)、个人 personal-bar(order 50)、官方硬编码的 ContextMeter。个人的 .dsph-bar 虽写了 width:100%，但在不换行的 flex 容器里只会被 flex-shrink 压缩，无法独占一行。CSS 无法选择父元素，插件侧唯一不碰官方源码的补救是 :has()——而该规则在用户浏览器中确认不生效（页面已刷新过），根因未查明。"
fix: "给官方 CSS 打补丁（official-patches/apply-patches.mjs 第 15 条）：packages/client/ui-conversation/src/client/skeleton/InputBar.module.css 的 .dock 规则内插入 `flex-wrap: wrap;`（附注释说明个人插件在此追加整行胶囊）。同时 dsh-personal-bar 的 client.js 保持 `.dsph-bar { order: 999; flex: 0 1 100%; ... }`——basis 100% 在允许换行的容器里必定独占一整行，order 更大使其排在官方条目之后；flex-shrink 保持 1 作为兜底（补丁若失效则退回原共享行而非溢出容器）。已 pnpm run build 重建（exit 0，250 client artifacts），产物验证 lib/client.js 内含 .fAdZpG_dock{flex-wrap:wrap;...}。补丁经纯净官方源锚点唯一性校验。"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\client\\ui-conversation\\src\\client\\skeleton\\InputBar.module.css"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-bar\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-bar\\README.md"
---

排查过程（三轮，前两轮失败的原因值得记录）：

第 1 轮：判定宿主 .dock 是 nowrap 横向 flex 后，选择用插件侧 `:has()` 规则改父容器：`div:has(> .dsph-bar) { flex-wrap: wrap }` + `.dsph-bar { order:999; flex:0 1 100% }`。用户反馈无效。
第 2 轮：加 `!important` 与双层选择器（`> .dsph-bar` 与 `> * > .dsph-bar`）仍无效；同时我错误地用「把胶囊移到 conversation.input.dock（composer 上方）」来回避问题，被用户质疑「之前为什么可以放在最底部」——位置本不该动，这是取舍错误，已改回。
第 3 轮：放弃父选择器，直接给官方 .dock 打补丁加 `flex-wrap: wrap`，配合插件侧 order/flex-basis。用户确认生效：「单独一行官方的标签和独立一行我的个人插件胶囊」。

关于 :has() 为何无效：未能查明。已确认的事实是 (a) DOM 结构假设正确——读 packages/client/ui-renderer/src/client/scoped-slots.tsx 第 1238-1244 行，list slot 用 Fragment 渲染，每个条目过 guarded()，而 guarded 包的是 SlotErrorBoundary（React 错误边界，不产生 DOM 元素），所以 .dsph-bar 确为 .dock 的直接子元素；(b) 插件 CSS 确实注入且生效（.dsph-bar 的 display:flex/gap 等规则可见效果，胶囊是横向排列的）。即选择器理论上应匹配却未生效，怀疑与浏览器对 :has() 的支持或 CSS Modules 作用域有关，未进一步定位即改用补丁方案绕过。

三条通道全部无法自查（这是本次耗时长的根本原因）：(1) get_window_state 的截图无法阅读——当前模型 deepseek-v4.1-flash 不声明 image 输入，工具返回 "image unavailable"；(2) cua_driver_native__page 的 execute_javascript 被策略拒绝——“legacy page mutation is unbounded and requires unrestricted mode with trusted launch-time risk acceptance”；(3) 同工具的 query_dom 在 Chrome 上报 "ElementFromHandle failed: 事件无法调用任何订户 (0x80040201)"，且不支持复杂选择器（Windows UIA 后端）。另尝试用 get_window_state 的元素 bounding frame 比较 y 坐标来判断是否同行，但富文本输出只含无障碍树、不含 frame 数据。因此三轮判断全部依赖用户口述反馈。

两条必须记住的操作教训：
(a) **client 侧 CSS/TS 改动必须 `pnpm run build` 重建 bundle 才进产物**——第一次改 official CSS 后我误以为改文件即生效，实际产物 packages/client/ui-conversation/lib/client.js 需要 tsdown 重建才包含新规则；且该类名格式是 `<hash>_dock`（如 .fAdZpG_dock）而非 `_dock_<hash>`，我最初用错正则导致误判“CSS 没进产物”。
(b) **重启 DSH 服务不会刷新浏览器的 client bundle**——第 1、2 轮的“无效”极可能有一部分就是浏览器仍跑旧 bundle。此后凡改 client 侧，验证前必须刷新页面（cua_driver hotkey ctrl+r 对 Chrome 必须用 delivery_mode=foreground，background 会报 background_unavailable；且 Chrome 的 window_id 每次会变，须先 list_windows 重取）。
