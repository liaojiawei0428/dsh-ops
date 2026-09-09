---
date: "2026-09-09T02:24:16.364Z"
symptom: "官方 0.1.5 更新后 7 个历史子代理会话打开失败（subagent/descriptor version must be one of 3）"
component: "官方 session-format-v2-to-v3 迁移链（本地补丁）"
severity: "critical"
status: "fixed"
root_cause: "v2→v3 迁移链复用 v0→v1 的 subagentDescriptorValue 校验器，其 literalValue 硬编码仅接受 version 3，拒绝 released 历史数据中的 version 2 descriptor，导致 7 个子代理会话无法读取。"
fix: "payload-validation.ts 的 subagentDescriptorValue 接受 [2,3]；tsc + tsdown 重建 lib；等待重启服务加载。"
related_files:
  - "E:\\DSH\\Deepseek_DSH\\packages\\session\\session-format-v0-to-v1\\src\\payload-validation.ts"
---

官方 0.1.5-alpha.1（SESSION_FORMAT_VERSION 2→3）更新后，全量读历史会话发现 7 个会话打开失败：3f39934e/4c7fcc36/56dff0fb/99ce1814/a5e2fd0f/d966021c/f34c2bbc，错误 '@deepseek-ai/dsh-session-format-v2-to-v3 refuses this format v2 Session: subagent/descriptor 0 version must be one of 3'。证据链：1) 这 7 个会话的 session.v2.jsonl.zstd 里 subagent/descriptor 均为 version 2、mode continuable、provider spawn——官方自己产出的合法 released 历史数据；2) 根因在 packages/session/session-format-v0-to-v1/src/payload-validation.ts 的 subagentDescriptorValue：literalValue(data['version'], [3], ...) 硬编码只接受 3，而 v2→v3 迁移链复用了该 v0 词汇校验器，version 2 被拒；3) 与 0.1.3-alpha.1 时修过的问题同根（当时修的是同一函数 + validation.ts 的 v0 分支），官方从未合入该补丁（保留在 personal 分支 agent/local-v0-migration-fix），0.1.5 的 v3 读取路径再次触发。修复：把 [3] 改为 [2, 3]（version 2 的成员集是 version 3 的子集，lossless；运行时读取器忽略未知版本，语义不变），重建 lib（tsc -p tsconfig.json 编译 src→lib/types 后 tsdown 打包——注意该包 tsdown 入口是 lib/types/index.js，必须两步都跑）。验证：typecheck 过；官方 0.1.5 lib 补丁后全量读 51/51 会话成功（补丁前 44/51）。运行中的服务（pid 9572, 10:14 启动）加载的是补丁前 lib，需重启生效。


> 2026-09-09 架构分离更新: 补丁载体已从官方 checkout（现已纯净）迁移到个人运行副本 `E:\DSH\DSH-ops\Deepseek_DSH`，由 `official-patches/apply-patches.mjs` 精确文本替换管理（见 ARCHITECTURE.md）。官方升级后由 sync-official.ps1 自动重打。
