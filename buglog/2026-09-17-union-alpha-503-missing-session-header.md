---
date: "2026-09-17T10:17:44.307Z"
symptom: "openCode Go 模型 union-alpha 调用稳定失败：503 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Error from provider (Console Go): Upstream request failed: Endpoint is unavailable.\"}}，会话被迫切换到其他模型继续。"
component: "llm-deepseek"
severity: "minor"
status: "open"
root_cause: "上游 opencode.ai/zen/go 的 union-alpha（\"Union Alpha Free\" 限时免费模型）后端端点极度过载/不可用：同一 x-opencode-session 首次请求 50.9 秒才返回 200，紧接着第二次即 503；全新 session 直接 503。同端点同密钥下 qwen3.8-flash、minimax-m3、deepseek-v4.1-flash、gpt-5.6-luna 均 200 正常，故非本机网络、密钥、额度或 DSH 配置问题。附带发现独立的 DSH 侧缺陷：LLM 路径未发送 opencode 要求的 x-opencode-session 头（只有 packages/web/web-search-deepseek/src/provider.ts:236 发送，且硬编码 'dsh-web-search'；packages/llm/llm-deepseek/src/protocols/messages/adapter.ts:127 只发 x-api-key + anthropic-version）。opencode 官方文档 https://opencode.ai/docs/go/ 已把 DeepSeek Harness 列入 \"Known Problematic Clients\"：\"Session information arrives on some model paths, but is missing on others.\""
fix: "未修复（仅诊断）。缓解：在 DSH 模型选择中避开 union-alpha，改用同 provider 下的 qwen3.8-flash / minimax-m3 等稳定模型；本次会话已由 opencode-live/deepseek-v4.1-flash 承接。待办：在 llm-deepseek 的 anthropic-messages 适配器（及 openai-completions / openai-responses 路径）为 opencode 系 baseURL 注入稳定的 x-opencode-session，替代硬编码值，以恢复上游会话亲和路由与 prompt 缓存。"
related_files:
  - "packages/llm/llm-deepseek/src/protocols/messages/adapter.ts"
  - "packages/web/web-search-deepseek/src/provider.ts"
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
---

排查过程：1) bug_search 无既有记录。2) 读 ~/.dsh/settings.yaml 确认 union-alpha 只配置在 opencode-live-anthropic provider 下（baseURL https://opencode.ai/zen/go，api anthropic-messages）；opencode-live 与 opencode-live-responses 均未声明该模型，因此会话历史里出现的 opencode-live-responses/union-alpha、opencode-live/union-alpha 是跨 provider 重试，注定失败。3) 直连探测 GET /zen/go/v1/models → 200，union-alpha 在列，密钥有效。4) 对照实验（同 key、同 anthropic-version，带 x-opencode-session）：union-alpha → 503 ×2；qwen3.8-flash / minimax-m3 / deepseek-v4.1-flash → 200。5) 协议横切：union-alpha 在 /v1/chat/completions 与 /v1/responses 返回 500 Internal server error，而 gpt-5.6-luna 在 /v1/responses → 200，证明是模型级不可用而非协议不匹配。6) 固定同一 session id 连发：第 1 次 200（耗时 50880ms，异常缓慢），第 2 次 503 —— 上游端点存在但严重拥塞，与 "Free / Unlimited / limited time" 的免费最低优先级定位一致。7) 全仓 grep x-opencode-session 仅命中 web-search-deepseek，确认 LLM 适配器未发送该头，与 opencode 官方 Known Problematic Clients 描述吻合；该缺失未证明是本次 503 的直接原因（带该头仍是 503），属独立缺陷。结论：503 为上游容量/可用性问题，DSH 侧配置与路由均正确。
