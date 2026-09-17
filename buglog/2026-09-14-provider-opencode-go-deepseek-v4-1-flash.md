---
date: "2026-09-14T01:30:36.260Z"
symptom: "模型页给 provider \"opencode-go\" 添加 \"deepseek-v4.1-flash\"（Opencode GO 套餐模型）失败：llm-pi-ai: provider \"opencode-go\" model \"deepseek-v4.1-flash\" needs an api; the installed catalog does not describe it，添加后模型不出现。"
component: "llm-pi-ai / settings 集成（opencode-go 目录外模型）"
severity: "major"
status: "fixed"
root_cause: "pi-ai 0.85.1 内置 opencode-go 目录快照不含 deepseek-v4.1-flash（目录约 30 个模型无此 id），且 opencode-go 目录模型横跨 openai-completions / openai-responses / anthropic-messages 三种协议，sharedCatalogApi() 在 apis.size=3 时返回 undefined（catalog.ts 注释明言\"该情形无公共协议可答\"）；settings.yaml 的 opencode-go 段又未显式声明 api → resolveEntry 的 api = request.api ?? base?.api ?? routeApi 三个来源全空 → PiAiCatalogError，strict 写校验拒绝整次写入，模型\"添加了却没有\"。"
fix: "~/.dsh/settings.yaml 的 opencode-go 段补 api: openai-completions（与目录内 deepseek-v4-flash 同协议，端点 /zen/go/v1 为 OpenAI 兼容），models 列表补 {id: deepseek-v4.1-flash, name: deepseek-v4.1-flash}；先用 eemeli/yaml 2.9.0 round-trip 原子改写（脚本 E:\\DSH\\DSH-ops\\fix-opencode-go-settings.cjs，临时文件+rename），写后回读校验 api/models 正确、diff 仅目标两处；原文件已备份至 backups/settings-20260914-092907.yaml；重启服务后模型页应可见 opencode-go/deepseek-v4.1-flash。"
related_files:
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "E:\\DSH\\DSH-ops\\fix-opencode-go-settings.cjs"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\catalog.ts"
---

用户报错与 09-08 回归（pi-ai 0.85 目录删模型）同源但不同位置：本次是"目录外新增模型"。验证链：读 settings.yaml 确认 opencode-go 段无 api 且 models 仅 deepseek-v4-flash；读 llm-pi-ai/src/catalog.ts 888-891 行确认 api 三级回退与报错文本；读 pi-ai 0.85.1 dist/providers/data/opencode-go.json 确认目录无 deepseek-v4.1-flash 且模型分属三种 api 协议 → sharedCatalogApi(defaults)（659-663 行）apis.size=3 返回 undefined，路由未显式 api 时必然报错。对比：bai/agnes/unlimitds/go 等 hand-declared 路由均显式声明 api，而 opencode-go 是无 api 的目录路由；go 路由（opgo）已含 deepseek-v4.1-flash 且 api: openai-completions，可作旁证。修复后 round-trip diff 仅两处新增（模型条目 + api 字段），其余 120 行原样保留。重启后需验证 llm/listProviders 含 opencode-go 且 deepseek-v4.1-flash 可解析。
