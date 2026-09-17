---
date: "2026-09-14T01:45:35.299Z"
symptom: "同一个 baseURL（https://opencode.ai/zen/go/v1），DSH 内置提供商 opencode-go 的\"获取可用模型\"返回 27 个且无 deepseek-v4.1-flash；自定义添加的提供商返回 37 个实时模型，两者列表不一致，用户误以为内置提供商添加不了新模型。"
component: "llm-pi-ai / discovery（目录快照 vs 端点探活）"
severity: "minor"
status: "workaround"
root_cause: "llm-pi-ai 的模型发现按 provider 是否命中 pi-ai 内置目录分叉：discovery.ts 269-285 对命中者直接返回 catalogModels()（pi-ai 包内静态快照 opencode-go.json，0 次网络请求），只有未命中的 provider 才走 286-362 的 GET {baseURL}/models。因此同一 URL 下，内置路由的答案是\"打包时的快照\"（27 个），自定义路由的答案是\"端点实时列表\"（37 个，多出 deepseek-v4.1-flash 等 10 个）。provider.ts 144-159 复用目录 provider 时还丢弃了 catalog 的动态刷新，pi-ai 的 opencodeGoProvider() 本身亦只有静态 models，无刷新方法。契约见 packages/llm/llm/src/types.ts 249-266（适配器已知模型即用自身注册表回答，代价为零网络调用）。"
fix: "本机绕过（不改上游）：①目录路由手工补新模型（本机已做：settings.yaml 的 opencode-go 补 api: openai-completions + deepseek-v4.1-flash 条目）；②需要端点完整实时列表时，用\"非目录名\"的自定义提供商指向同一 baseURL，其 discovery 会走网络返回全部 37 个，再按需采纳；③注意权衡：目录路由一旦设路由级 api，会覆盖其 models 列表内每个模型各自的协议（catalog.ts 888 行 request.api 优先于 base.api），故不要在该路由里混入目录中属 openai-responses/anthropic-messages 的模型（grok-*、gpt-5.6-luna、muse-spark-*、minimax-m3、qwen3.8-flash），否则会被强制改协议。更干净的形态是新建独立自定义路由承载端点新模型。"
related_files:
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\discovery.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\provider.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\node_modules\\@earendil-works\\pi-ai\\dist\\providers\\data\\opencode-go.json"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm\\src\\types.ts"
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
---

调查方法（可复现）：①代码链——llm-pi-ai/src/discovery.ts 269-285 对 provider 命中 pi-ai 内置目录者短路返回 catalogModels()，完全不发网络；286-362 才对目录未描述的 provider 发 GET {baseURL}/models。②契约——packages/llm/llm/src/types.ts 249-266 明确"adapter 已知模型就用自己的注册表回答，代价为零网络调用"。③进程内实测——discoverModels({provider:'opencode-go', baseURL:'http://127.0.0.1:1/v1'}) 仍返回 27 个模型（不可达地址证明未触网），同参数 provider:'my-custom-go' 或 undefined 则报 could not reach http://127.0.0.1:1/v1/models（证明自定义路由走网络）。④端点直连——Node fetch（与 DSH 同栈）GET https://opencode.ai/zen/go/v1/models 带 Bearer key 返回 200、37 个模型；python urllib 被 Cloudflare Error 1010（browser_signature_banned）拦截，需用 Node fetch 复现。⑤差集——端点 37 vs 快照 27，端点多出 10 个（deepseek-flash、deepseek-v4.1-flash、glm-5、grok-4.5、hy3-preview、kimi-k2.5、mimo-v2-omni、mimo-v2-pro、minimax-m2.5、qwen3.5-plus），快照独有 0 个（严格子集，纯滞后）。⑥旁证——provider.ts 144-159 reuseCatalogProvider 丢弃 catalog 动态刷新（getModels: () => spec.models），且 pi-ai 的 opencodeGoProvider() 本身只有静态 models，无任何刷新方法。结论：非随机故障，而是"静态快照优先"的设计权衡；用户期望的"同一地址应得同一列表"在此架构下不成立。上游改进方向：目录路由的 discovery 提供可选探活或快照-端点差异提示；或随 pi-ai 版本升级同步目录。
