---
date: "2026-09-18T02:15:06.335Z"
symptom: "四个个人插件的 UI 条目共享一个由其中之一的 client 半创建的自定义 slot `dsh.personal.bar`；若创建方（dsh-personal-hub）缺席，另外三个（server-ssh、github-push、deepseek-balance）会静默停止注册，界面无提示、日志无错误。"
component: "dsh-opencode-session-id / 插件间 slot 依赖"
severity: "minor"
status: "open"
root_cause: "dsh-personal-hub 的 client 半在注册自己的 `conversation.composer.dock` 条目时，顺带把 `dsh.personal.bar` 声明为该条目的 child slot；server-ssh、github-push、deepseek-balance 三个插件把各自的 UI 条目注册进这个**由另一个插件创建**的 slot。而 `slots.inject(name, cb)` 只在 slot 已存在时执行 cb，slot 缺失既不注册也不报错，于是供应方一旦缺席，消费方全部静默消失。"
fix: "未修复（仅诊断）。当前四个 occupant 全部 active，功能正常。缓解手段：在 personal-hub 的 README 与插件清单里显式记录\"dsh.personal.bar 由 personal-hub 声明，server-ssh / github-push / deepseek-balance 消费\"这条依赖；需要独立演进时再按上述候选方案拆分。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-personal-hub\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-server-ssh\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-github-push\\client.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-deepseek-balance\\client.js"
---

发现过程：在 0.1.6-alpha.2 更新后做插件冲突深度检查时，用 cordis_inspect_query 查活的 Slot 树，发现四个插件注册在同一个自定义 slot `dsh.personal.bar` 下（occupants: server-ssh order 30、github-push order 40、deepseek-balance order 100、deepseek-balance-version order 101，全部 active:true）。

追查该 slot 的来源：它不在官方 Slot 目录中，而是由 dsh-personal-hub 的 client 部分在注册 `conversation.composer.dock` 条目时**声明为 child**：

    slots.inject(HOST_SLOT, () => slots.register({
      name: HOST_SLOT, id: 'personal-bar', order: 50,
      children: { [BAR_SLOT]: { kind: 'list', scope: 'session' } },
    }, PersonalBar))

其中 HOST_SLOT = 'conversation.composer.dock'，BAR_SLOT = 'dsh.personal.bar'。另外三个插件则用 `slots.inject('dsh.personal.bar', () => slots.register({...}))` 往里注册。

风险：`slots.inject(slotName, callback)` 的语义是"该 slot 存在时才执行 callback 完成注册"。一旦 dsh-personal-hub 被禁用、加载失败或它的 client bundle 出错，`dsh.personal.bar` 就不再存在，另外三个插件的注册回调**不会执行且不报错**——UI 上表现为这三项静默消失（服务端 SSH、GitHub 推送、DeepSeek 余额），日志里没有任何异常。当前状态正常（四个 occupant 全部 active:true），所以这是潜在故障而非现存故障。

为什么现在才暴露：这三个插件各自都能独立加载并通过 validate-plugins（它检查的是"能加载、apply() 注册、schema 有效"，不追踪跨插件的 slot 供应关系），所以加载层检查永远是绿的。只有查活的 Slot 树才能看见这层依赖。

同类隐患：personal-hub 自身依赖 `conversation.composer.dock` 与 `settings.plugins.tab`（官方 slot）、plugin-guide 依赖 `settings.plugins.tab`——这几个是官方提供的，风险低；`dsh.personal.bar` 是四个插件里唯一由个人插件自建、被多个插件消费的 slot。

候选修复（未实施，需用户决策）：(1) 把 `dsh.personal.bar` 的声明从 personal-hub 抽到一个独立的、无 UI 的共享插件，四个消费者都 inject 它；(2) 让三个消费者在 slot 不存在时各自回退到官方 slot（如 `sidebar.panellist`）或直接注册到 `conversation.composer.dock`；(3) 至少在各插件的 README 与 personal.json 里显式记录这条依赖，避免未来有人单独禁用 personal-hub 时无从排查。
