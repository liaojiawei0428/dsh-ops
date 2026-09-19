---
date: "2026-09-17T03:17:01.852Z"
symptom: "DSH 的 web_search 工具完全不可用（先是占位 key 导致 401；切到 Zen 网关后又因缺 x-opencode-session 头 400；补头后仍因所选模型不触发服务端搜索而报 \"DeepSeek returned no web_search_tool_result blocks\"）。"
component: "dsh-web-search-deepseek / official-patches / personal-hub"
severity: "major"
status: "fixed"
root_cause: "三层叠加：(1) 基座默认的 web-search-deepseek 后端使用 DEEPSEEK_API_KEY（本机为占位值 \"1111\"）访问 DeepSeek 官方 Anthropic 端点，必然 401；(2) 改用 OpenCode Zen Go 网关后，该 provider 用私有原生 fetch 发请求、不经过 ctx.llm，因此拿不到会话适配器注入的 x-opencode-session 头，被网关以 400 missing session 拒绝，而请求头是硬编码的、无配置项可补；(3) 服务端 web_search_20250305 由模型自主决定是否调用，不同模型的触发率差异极大（deepseek-v4-flash 10/10，minimax-m3 2/5，qwen3.8-flash 与 minimax-m2.7 0/5），未触发时 provider 依设计抛 WEB_PROVIDER_ERROR 而非降级，因此即使链路打通，选择触发率低的模型也会表现为持续失败。"
fix: "1) official-patches/apply-patches.mjs 新增第三条精确替换，给 web-search-deepseek 的请求头补 x-opencode-session（值可经 DSH_OPENCODE_SESSION_ID 覆盖，默认 dsh-web-search）；2) personal-hub/personal.json 的 extraPatches 配置该 provider 指向 OpenCode Zen Go 网关并使用 deepseek-v4-flash；3) 走既有链路：sync-official.ps1 同步+打补丁+重建 → personal_hub_reapply → 闸门 → 重启 → web_search 实测两次通过。"
related_files:
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "E:\\DSH\\DSH-ops\\personal-hub\\personal.json"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
  - "E:\\DSH\\DSH-ops\\Deepseek_DSH\\packages\\web\\web-search-deepseek\\src\\provider.ts"
---

症状起因：web_search 工具此前完全不可用，报 "DeepSeek API error (HTTP 401): Authentication Fails, Your api key: 1111 is invalid"——基座 bundle 默认挂载的 @deepseek-ai/dsh-web-search-deepseek 走 DeepSeek 官方 Anthropic 兼容端点 https://api.deepseek.com/anthropic/v1/messages，而本机 DEEPSEEK_API_KEY 是占位值 "1111"。

调查与选型（逐项实测，非推断）：

1) 后端可用性扫描：Agnes（agnes-2.5-flash / agnes-3.0-flash）返回 tool_use 块——把 web_search 当客户端工具，要求调用方执行，且模型自身无内置联网（直接回答"没有实时信息访问权限"）；b.ai（glm-5.3-flash）200 但只回 text，工具被静默忽略；UnlimitDS 35 秒无响应；OpenCode Zen 返回结构化 web_search_tool_result 块 ✅ 唯一可用。

2) 免费模型不可用：/zen 面的 free 层（union-alpha、deepseek-v4-flash-free 等）返回 403 "OpenCode's free tier can only be used from within OpenCode"；Go 面的 Union Alpha Free 虽免费无限量，但带 web_search 工具时 400 "tools[0] must have a string name and an object input_schema"，同样不认服务端工具。

3) 网关要求：/zen/go 面硬性要求每会话稳定的 x-opencode-session 头（缺失即 400 "Request is missing x-opencode-session and cannot be routed efficiently"）。而该 provider 用私有原生 fetch（provider.ts 注释明确"不使用 ctx.llm"），请求头硬编码六项、不含 session 头，也没有任何配置项可加——自研插件 dsh-opencode-session-id 只作用于会话适配器路径，覆盖不到它。Zen 文档 "Known Problematic Clients" 表格明确列出 DeepSeek Harness 正是这个问题（Discussion #5495），并要求客户端"发自己的 UA + 每会话稳定 session ID"，故补此头是官方期待的修复而非绕过。

修复：

- 第三条官方补丁（official-patches/apply-patches.mjs）：对 packages/web/web-search-deepseek/src/provider.ts 的请求头块精确替换，插入 `'x-opencode-session': process.env.DSH_OPENCODE_SESSION_ID ?? 'dsh-web-search'`。对 DeepSeek 官方端点是未知头、被忽略，无害。目标文本在官方 checkout 与副本中各恰好出现 1 次（已预演），官方若改动该处会 fail-loud。
- personal-hub 清单（personal-hub/personal.json 的 extraPatches）：web-search-deepseek → baseURL=https://opencode.ai/zen/go/v1、apiKeyEnv=OPENCODE_GO_API_KEY、model=deepseek-v4-flash。写进清单而非手工改 profile，避免下次 personal_hub_reapply 被清掉。

4) 模型命中率实测（关键，决定了 model 字段的取值）：服务端 web_search 由模型自主决定是否调用，未触发时响应无结果块，provider 依设计硬报 WEB_PROVIDER_ERROR（不从正文抓 URL）。同一查询各跑 5 次：deepseek-v4-flash 5/5（另一次统计合计 10/10）、minimax-m3 2/5、qwen3.8-flash 0/5、minimax-m2.7 0/5。故由 minimax-m3 改为 deepseek-v4-flash。用量实测：平均 input 5340 / output 989 tokens，Go 面 off-peak $0.15+$0.60、peak $0.30+$1.20 per 1M ⇒ 约 $0.0014~0.0028/次，月额度 $30 ⇒ 约 1~2 万次/月。

验收证据：

- 补丁落地：副本 src/provider.ts 与构建产物 lib/index.js、lib/types/provider.js 均含 x-opencode-session；另外两条补丁（rpc-host、payload-validate）仍在。
- profile：cordis.patch.yml 出现 web-search-deepseek 托管条目（baseURL/apiKeyEnv/model 正确），且此前修复的 opencode-session-id providers: [] 覆盖仍在。
- 端到端：重启后连续调用 web_search 工具两次（查询分别为 "DeepSeek Harness 0.1.6 release notes" 与 "OpenCode Zen 定价 免费模型"/"Cua Driver computer use 支持平台"），分别返回 4 条与 6 条来源；健康检查全绿（服务 pid 50336、看门狗在岗、12 bundles、闸门 10/10、回归 T1–T4）。
- 闸门与回归：validate-plugins 全绿；personal_hub_reapply 两次均复检无漂移（备份 2026-09-17T03-07-16 / 03-16-00）。

注意事项：补丁在每次官方更新时由 sync-official.ps1 自动重新应用；换搜索模型只改 personal.json 的 model + reapply + 重启即可，但换前应按下表复测命中率。
