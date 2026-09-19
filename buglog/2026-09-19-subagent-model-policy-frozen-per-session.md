---
date: "2026-09-19T02:04:18.217Z"
symptom: "已在设置里授权子代理可用的模型，但派子代理仍报 child LLM route \"provider/model\" is not allowed for this Session；改设置与重启服务均无效"
component: "dsh-subagent / tool-subagent（官方）"
severity: "minor"
status: "workaround"
root_cause: "子代理模型授权策略在会话创建时采样一次并作为会话事件追加进日志（model-selection-state.ts:77-79 只写一次），settings 更新不会重建已运行会话的工具定义（model-selection-settings.ts:72-73）。因此改设置与重启服务对已存在的会话均无效，只有新会话才重新采样。叠加第二个因素：若此后修改了 provider 的 model id（agnes-2.5-flash → agnes-3.0-flash），旧会话策略里的授权会静默悬空，而错误信息统一为 \"not allowed for this Session\"，不提示模型已不存在或策略已过期。"
fix: "不改代码（官方设计行为）。规避：改完子代理模型授权后必须新开会话才生效，重启无效；诊断固化策略读 session_projcache 的 record.rows.subagentModelSelectionPolicy.val；改 provider 的 model id 会使已有会话的旧授权悬空；不显式指定模型时走\"继承父 Agent\"路径，不受策略约束"
related_files:
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\subagent\\tool-subagent\\src\\model-selection-state.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\subagent\\tool-subagent\\src\\model-selection-settings.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\subagent\\tool-subagent\\src\\model-selection.ts"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\subagent\\tool-subagent\\src\\list-models.ts"
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "C:\\Users\\Administrator\\.dsh\\storages\\session_projcache\\sessions\\session-3db168db-b264-4228-a931-87a590b5f839.json"
---

## 症状
在设置 → 插件 → Subagent 里授权了子代理可用的模型，但派子代理时仍报：
`child LLM route "agnes/agnes-3.0-flash" is not allowed for this Session`
以及 provider 级被拒：`LLM provider "opencode-live" is not allowed for this Session`。
**改设置、重启 DSH 服务都无效**，错误信息也不说明真正原因。

## 根因（两段叠加，均为官方设计行为，非缺陷）
**① 策略随会话固化，只写一次。**
`subagent/tool-subagent/src/model-selection-state.ts` 第 77-79 行：`subagentModelSelectionPolicy(...) !== undefined` 时直接返回，否则 `session.append('subagent/model-selection-policy', { allowedModels })` —— 策略作为**会话事件追加进日志**，一份会话只写一次。
`model-selection-settings.ts` 第 72-73 行的注释把边界写死了：*"Consumers snapshot per Session, so a settings update never rebuilds the tool definitions of a Session that is already running."*
`tool-subagent` 工具描述亦称 *"Sample the Host `subagent-model-selection` setting for each new top-level Session and inherit that decision in its child Sessions."*
**推论：改设置只影响新会话；重启服务不会重写历史会话的这条记录。**

**② provider 的 model id 改动会让旧授权静默悬空。**
本次实测：某会话创建于 2026-09-17 10:38，其固化策略为 `[{provider: agnes, model: agnes-2.5-flash}]`（从投影缓存读出）。之后用户把 agnes provider 的模型改成 `agnes-3.0-flash`（settings.yaml 的 `llm-pi-ai.providers.agnes.models` 只剩 3.0）。于是该会话里：
- 试 `agnes/agnes-3.0-flash` → 不在策略里 → 拒绝；
- 策略里那条 `agnes/agnes-2.5-flash` → provider 已不再提供该模型 → 形同虚设；
- **该会话实际上没有任何可用的显式模型路由。**
错误信息统一是 "not allowed for this Session"，**不会**提示"该模型已不存在"或"策略已过期"。

**③ 附带的一个易误判点**：`list_subagent_models` 无参数时按 **provider 级**过滤（`list-models.ts:51`：`policy.routes.some(route => route.provider === provider.id)`），所以 provider 能被列出**不代表**其某个具体 model 可用；route 级校验在 `assertAllowedModelSelection`（`model-selection.ts:151`）另做一次 provider+model 双匹配。

## 修复 / 规避
无需改代码（官方设计如此）。规避与诊断方式：
- **要让新授权生效 → 新开会话**，不要用重启代替；回到旧会话状态依旧。
- **诊断固化策略**：读会话投影缓存
  `C:\Users\Administrator\.dsh\storages\session_projcache\sessions\<sessionId>.json`
  的 `record.rows.subagentModelSelectionPolicy.val`（本次据此定位到 09-17 的旧策略）。会话日志本体为 `~/.dsh/sessions/<cwd-slug>/<sessionId>/session.v3.jsonl.zstd`（zstd 压缩）。
- **改 provider 模型 id 时**记得：已存在会话里针对旧 id 的授权会失效，需要新会话重新授权。
- **不受策略约束的路径**：不显式指定 provider/model 时，`assertAllowedModelSelection` 第一行即返回（`model-selection.ts:145`），子代理**继承父 Agent 模型**。所以即使授权全部悬空，派子代理的能力仍在，只是不能挑模型。

## 验证
新会话按 6 步验证：`list_subagent_models` 列出 agnes 与 opencode-live 两个 provider；分别派发 `agnes/agnes-3.0-flash` 与 `opencode-live/deepseek-v4.1-flash` 的最小子代理，**均按指令原文返回 `OK`**——证明新会话策略已刷新、两个模型均可用。同时确认 `agnes-2.5-flash` 在路由目录中已被 `agnes-3.0-flash` 取代。
