---
date: "2026-09-14T01:51:47.430Z"
symptom: "端点 /models 列出 37 个模型，其中 10 个实际不可调用（7 个 Model is unavailable、2 个 RegionError 403、1 个 gpt-5.6-luna 403）；pi-ai 目录快照则只有 27 个且含 3 个已失效模型。若照搬名单配置，模型选择器里会出现选即报错的条目。"
component: "llm-pi-ai / opencode 端点模型清单与可用性"
severity: "minor"
status: "fixed"
root_cause: "opencode.ai/zen/go 的 GET /models 是\"账号可见模型目录\"而非\"可用性声明\"：它只返回 id/object/created/owned_by 四个字段，不反映套餐资格、地区限制或上游健康状态，故列出的 37 个中有 10 个调用必失败。而 pi-ai 0.85.1 的内置快照是另一时刻的子集（27 个），其中还残留 3 个现已不可用的 responses 模型（gpt-5.6-luna、muse-spark-1.2/1.3）。两份清单都不能当作可用性依据，只有真实推理请求能判定。"
fix: "不配置实测不可用的 10 个模型（照搬 /models 列表会把选即报错的模型塞进选择器）；按协议分组重组：opencode-go 扩充为 23 个 completions 可用模型（目录名路由保证元数据保真，且保留用户当前会话在用的 deepseek-v4.1-flash），opencode-live-anthropic 3 个、opencode-live-responses 1 个。备份：backups/settings-20260914-095030.yaml（改造前）等三份。生效需重启 DSH 服务。"
related_files:
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "E:\\DSH\\DSH-ops\\probe-opencode-full.mjs"
  - "E:\\DSH\\DSH-ops\\finalize-opencode-routes.cjs"
  - "E:\\DSH\\DSH-ops\\patch-opencode-go-models.cjs"
---

探活方法（可复现，脚本 E:\DSH\DSH-ops\probe-opencode-full.mjs）：对 /models 全部 37 个 id 依次尝试 openai-completions（POST /chat/completions）、openai-responses（POST /responses）、anthropic-messages（POST /messages），全部带 x-opencode-session（网关强制要求，见 2026-09-07 记录），max_tokens=1，5 并发。协议判定信号：401 "Model X is not supported for format Y" = 协议不支持；400 "Error from provider (Console Go): ... Model is unavailable" = 网关支持该格式但上游/资格不可用；500 = 网关内部错。结果：可用 27、不可用 10。不可用明细：7 个 Model is unavailable（kimi-k2.5, glm-5, qwen3.5-plus, mimo-v2-pro, mimo-v2-omni, hy3-preview, grok-4.5，均不在 pi-ai 目录）、2 个 RegionError 403（muse-spark-1.2/1.3-contributor，"This model is not available in your region"，目录内）、1 个 403（gpt-5.6-luna，目录内 openai-responses）。另发现目录与实际不一致的实例：minimax-m2.7 目录记录 openai-completions 但 completions/responses 均 500、仅 anthropic-messages 200。配置改造（最终态）：opencode-go 是 pi-ai 目录名路由，只要路由级 api 与该路由下每个模型的目录协议一致就不会覆盖协议，故让 opencode-go(api=openai-completions) 承载 23 个 completions 可用模型——其中 20 个目录内模型仅写 id/name 即完整继承目录的 contextWindow/maxTokens/input/reasoning/thinkingLevelMap/compat（strict dry-run 已验证：23 个全部 reasoning=true、容量正确）；3 个目录外可用模型（deepseek-flash、deepseek-v4.1-flash、minimax-m2.5）显式补同族容量与 compat（deepseek 系克隆 deepseek-v4-flash：thinkingFormat=deepseek、maxTokensField=max_tokens、supportsStore=false、requiresReasoningContentOnAssistantMessages=true；m2.5 克隆 m2.7）。协议冲突的目录内模型另置自定义路由：opencode-live-anthropic（minimax-m3、qwen3.8-flash、minimax-m2.7，baseURL 必须为 https://opencode.ai/zen/go，因 Anthropic SDK 会自动补 /v1/messages）、opencode-live-responses（grok-4.6）。注意 DSH reasoningEfforts 语义：仅 off 可为 null，目录 thinkingLevelMap 中为 null 的等级（=不支持）应省略而非写 null。降级点：自定义路由不继承目录元数据，且 withhold 类 quirks 不可配置（如 grok-4.6 的 sessionAffinityFormat 在自定义路由上无法声明）；anthropic 组因目录无 thinkingLevelMap 而保持 reasoning=false。
