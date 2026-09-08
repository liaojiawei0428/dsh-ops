# Agent Note：扁平 v0 replay state 在 v0→v1 迁移中得以保留

Status: implemented

[English](2026-09-05-flat-v0-replay-state-migration-compat.md) | 中文

## 问题

released v0→v1 迁移拒绝两种 released v0 实际写过的 payload 形状，而每次拒绝（`SessionFormatUnsupportedError`）都会拒绝整份日志，0.1.3-alpha.1 升级后受影响会话的完整历史都无法加载；一处部署有两种形状共十一个这样的会话。

**扁平 pre-envelope replay state。** `finish` 流 chunk 的 `replayState` 按当前 `{response, blocks?}` 信封校验，但早期 released v0 构建还写过扁平 pre-envelope 形状——pi-ai 响应成员（`kind: 'pi-ai'`、`version: 1`、`api`、`provider`、`model`、可选的 `responseModel`/`responseId`、`stopReason`、`blocks`）全部位于顶层；一个会话两种形状并存，因为它横跨了信封切换期。运行时 replay 路径已按 [max-token replay-state 对齐决策](2026-08-15-max-token-replay-state-alignment.zh.md)把扁平形状降级为 provider 中立历史，而不是失败；缺失的只有迁移侧准入。

**子代理描述符 version 2。** `subagent/descriptor` 只校验 `version: 3`，但新增可选成员 `agentReasoningEffort` 的那次发布同时把版本从 2 升到 3，更早的 released v0 构建写入的是 version 2——其成员集合是 version 3 的子集。运行时读取器会忽略它不认识的版本，因此 lossless 准入该形状不改变任何运行时语义。

## 决策

`dsh-session-format-v0-to-v1` 的 `replayEnvelopeValue` 现在在当前信封之外同时接受扁平 pre-envelope 形状：顶层 `kind` 成员路由到 `flatPreEnvelopeReplayValue`，后者固定确切的 released 成员集合（`kind`/`version`/`api`/`provider`/`model`/`stopReason` 必需；`responseModel`/`responseId`/`blocks` 可选）并校验成员基本类型，未知 `kind` 仍然拒绝。`subagentDescriptorValue` 现在接受版本 2 和 3。迁移保持两处值 lossless——identity edge 把扁平状态与 version 2 描述符原样带入 v1 再到 v2，因此 `assistant/message` 的 source 与装配 replay-state 比对保持一致，运行时 replay 继续走既有降级路径。

## 已否决的替代方案

**迁移时把扁平形状转换成当前信封。** 已否决：扁平形状记录的是 replay version 1，`dsh-llm-pi-ai` 的信封读取器会拒绝它（`unsupported version`），升级只是制造一个消费方反正会降级的值，还把日志伪装成当前形状。

**像 message source 那样把 chunk 的 `replayState` 当作 opaque。** 已否决：message source 有意跳过值校验，但持久流 chunk 受益于已知形状准入守卫；完全透明会静默放行任何畸形成员集合。

## 后果

横跨两次形状演化的 released v0 构建写入的日志重新可以加载；迁移在同一会话内同时接受两种 replay-state 形状与两种描述符版本。对未知形状的校验强度不变：无法识别的顶层 `kind` 或成员集合、以及 2–3 之外的描述符版本仍然拒绝整份日志。迁移后 v1/v2 日志中的扁平状态对 pi-ai replay 重建仍是死重，继续按会话降级，与格式迁移存在之前完全一致。
