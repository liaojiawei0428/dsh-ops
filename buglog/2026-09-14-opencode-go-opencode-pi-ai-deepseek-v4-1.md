---
date: "2026-09-14T02:02:51.288Z"
symptom: "\"获取模型\"按钮在目录名路由（opencode-go/opencode）上永远返回 pi-ai 目录快照，看不到端点新上线的模型（如 deepseek-v4.1-flash）；用户希望列表反映端点最新全量，可用性另议。"
component: "llm-pi-ai / llm discovery 扩展点"
severity: "minor"
status: "workaround"
root_cause: "llm 服务的模型发现按 settings 命名空间注册且单值独占（重复注册抛 DUPLICATE_DISCOVERY），且没有 discovery 的 waterfall/事件扩展点——所以自研插件无法介入；而 llm-pi-ai 的发现实现又对命中 pi-ai 目录的 provider 短路返回包内静态快照、不发网络请求。两者叠加的结果是：任何\"目录名\"路由的\"获取模型\"按钮都只能看到 pi-ai 打包时的快照，配置层无法改变。"
fix: "配置层绕行：非目录名路由（opencode-live 及两个协议兄弟路由）作为实时发现入口，其\"获取模型\"按钮走网络返回端点全量；同时把端点 37 个模型按协议分组全部配齐，使新模型发布后可直接在列表/选择器中使用。归档校验与取证脚本便于日后复验。"
related_files:
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm\\src\\index.ts"
  - "E:\\DSH\\Deepseek_DSH\\packages\\llm\\llm-pi-ai\\src\\discovery.ts"
  - "E:\\DSH\\DSH-ops\\verify-llm-section.mjs"
  - "E:\\DSH\\DSH-ops\\probe-discovery-paths.mjs"
  - "E:\\DSH\\DSH-ops\\add-all-endpoint-models.cjs"
---

用户诉求演进：从"添加 deepseek-v4.1-flash 失败"→"内置与自定义提供商的模型列表为何不同"→"我要能拿到端点最新完整列表，可用性是另一回事"。本轮为满足最后一项所做的验证与实现：① 确认无扩展点——packages/llm/llm/src/index.ts 555-575 的 registerModelDiscovery 按 settingsNs 单值保存（this.discoveries.set），重复注册抛 DUPLICATE_DISCOVERY；全包 grep 无 discovery 相关 waterfall/事件（对比 llm/stream 有 waterfall）。因此自研插件无法拦截或扩展 llm-pi-ai 命名空间的发现结果，也不能在不重写整套发现逻辑（含凭据解析、目录快照、网络查询）的前提下替换它。② 唯一可行的配置层手段是"路由名不得命中 pi-ai 目录"——实测对照（同一端点同一 key，仅改 provider 名）：opencode-go → 27 个快照无 v4.1-flash；opencode → 68 个快照；opencode-live / my-own-gateway → 37 个实时结果含 v4.1-flash。取证脚本归档为 E:\DSH\DSH-ops\probe-discovery-paths.mjs。③ 最终配置：opencode-go 24（18 可用 + 6 暂不可用）、opencode-live-anthropic 8、opencode-live-responses 5（1 可用 + 4 暂不可用）= 端点全量 37；另设 opencode-live（3 个）作为实时发现入口，其按钮每次点击返回端点实时列表。④ 当前不可用的 10 个已标注：glm-5/kimi-k2.5/mimo-v2-pro/mimo-v2-omni/hy3-preview/qwen3.5-plus（Model is unavailable）、grok-4.5（同）、gpt-5.6-luna（403）、muse-spark-1.3/1.2-contributor（RegionError 403，官方文档注明"仅限部分地区"）。其中 6 个协议为同族推断（不可用无法实测），将来上线后若不符需修正一行配置。⑤ 常备校验工具 E:\DSH\DSH-ops\verify-llm-section.mjs（调用服务同款 resolveProfiles，deferred+strict 双跑，检查全部 provider 的 catalogError/modelErrors）。上游改进方向：目录路由的发现提供"快照 + 端点增量"合并（或 refresh 参数），使按钮在任意路由上都能反映端点上新。
