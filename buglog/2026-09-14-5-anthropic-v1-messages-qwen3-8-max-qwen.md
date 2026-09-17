---
date: "2026-09-14T01:54:38.074Z"
symptom: "按自建探活结果配置时，5 个官方指定 anthropic 协议（/v1/messages）的模型（qwen3.8-max、qwen3.7-max、qwen3.7-plus、qwen3.6-plus、minimax-m2.5）被误分到 openai-completions 路由，虽然能 200 但偏离官方指定路径。"
component: "llm-pi-ai / opencode-go 协议归属（探活方法论）"
severity: "minor"
status: "fixed"
root_cause: "自建探活脚本用\"首个 2xx 即判定协议\"的策略，而该网关对同一模型常同时兼容多种协议（completions 与 anthropic 都能 200），因此 200 只能证明\"可用\"不能证明\"官方指定协议\"。协议归属的权威来源是 OpenCode 官方文档的 API 端点表（逐模型指定 /chat/completions、/responses 或 /messages），而非探活结果。"
fix: "按官方端点表把 5 个模型从 opencode-go 迁至 opencode-live-anthropic（脚本 E:\\DSH\\DSH-ops\\fix-anthropic-group.cjs，备份 backups/settings-20260914-095337.yaml），最终 opencode-go(completions) 18 个 + opencode-live-anthropic 8 个 + opencode-live-responses 1 个 = 27 个实测可用模型；迁移模型显式补容量（目录容量与协议无关，可沿用）。修正后 anthropic 组 8 个全部 HTTP 200，strict dry-run 三路由无 modelErrors。需重启服务生效。"
related_files:
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "E:\\DSH\\DSH-ops\\fix-anthropic-group.cjs"
  - "E:\\DSH\\DSH-ops\\probe-opencode-full.mjs"
  - "E:\\DSH\\DSH-ops\\probe-anthropic-group.mjs"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm\\src\\attribution.ts"
---

问题：自建探活脚本按「openai-completions → openai-responses → anthropic-messages」顺序尝试、首个 200 即判定协议。opencode.ai/zen/go 网关对同一模型常同时接受多种协议（例如 qwen3.8-max 用 completions 也返回 200），因此"200"只能证明端点接受该协议，不能确定官方指定协议。结果 5 个官方指定 /v1/messages 的模型（qwen3.8-max、qwen3.7-max、qwen3.7-plus、qwen3.6-plus、minimax-m2.5）被误置于 completions 路由。纠正依据：官方文档 https://opencode.ai/docs/zh-cn/go/ 的「API 端点」表逐模型给出端点与 AI SDK 包（/v1/chat/completions=@ai-sdk/openai-compatible、/v1/responses=@ai-sdk/openai、/v1/messages=@ai-sdk/anthropic），是协议归属的权威来源。修正后实测：8 个 anthropic 模型用 POST /v1/messages（x-api-key + anthropic-version: 2023-06-01 + x-opencode-session）全部 HTTP 200。另注：pi-ai 0.85.1 目录对 qwen3.8-max/qwen3.7-max/qwen3.7-plus/qwen3.6-plus/minimax-m2.7 记录为 openai-completions，与官方端点表不符——又一处"目录快照失真"实例（minimax-m2.7 更是 completions 实测 500、仅 anthropic 可用）。方法论教训：协议判定应以官方端点表为准，探活只用于判定"可用性"；探活脚本若要判协议，应固定按文档协议验证而非首个 200 即停。官方文档同时印证了此前的可用性结论：文档"当前支持的模型列表"27 个与探活可用 27 个吻合；文档未列而探活报 "Model is unavailable" 的正是 glm-5、kimi-k2.5、qwen3.5-plus、mimo-v2-pro/omni、hy3-preview、grok-4.5；文档标注 Muse Spark 1.2/1.3「仅限部分地区」正对应探活 RegionError 403。文档对客户端的要求（专属 User-Agent、x-opencode-session 会话头）DSH 侧均已满足：packages/llm/llm/src/attribution.ts 发送 deepseek-harness/<version> (+repo url) 且经 adapter.ts:206 注入推理请求；会话头由自研插件 dsh-opencode-session-id 补齐。
