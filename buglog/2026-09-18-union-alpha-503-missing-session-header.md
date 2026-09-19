---
date: "2026-09-18T01:11:36.530Z"
symptom: "opencode Go 网关路由（opencode-live / opencode-live-anthropic 等）缺少每会话会话头时被网关以 HTTP 400 MissingSessionID 拒绝，该网关全部模型不可用；部署侧只能靠 dsh-opencode-session-id 插件包装 fetch 兜住。附带观察到的 union-alpha 503 属上游端点容量问题，与适配器缺陷无关。"
component: "llm-pi-ai / official-patches"
severity: "major"
status: "fixed"
root_cause: "两层叠加：(1) opencode.ai /zen/go 自 2026-09-05 起强制每会话会话身份头，缺失时返回 HTTP 400 MissingSessionID（实测：不带任何会话头 → 400；带 x-opencode-session 或 DSH 原生头 x-deepseek-harness-session-id → 200；带 x-session-affinity → 400 不被接受）；而 packages/llm/llm-pi-ai 的 PiAiAdapter 只发送 profile.headers 与 User-Agent attribution，从不发送会话身份——pi-ai 自身的 sendSessionAffinityHeaders 机制发出的是 x-session-affinity，网关不认。opencode 官方文档的 Known Problematic Clients 表格点名 DeepSeek Harness 即此问题（session information 只在部分 model path 送达）。(2) 该缺口此前由自研插件 dsh-opencode-session-id 在 wire 层包装全局 fetch 兜住，属部署级 workaround：其他组合不可见，且把一个请求头决策移出了拥有该请求的适配器。"
fix: "packages/llm/llm-pi-ai 新增 provider profile 字段 harnessSessionHeader?: boolean（默认关，因该值标识单个对话，只在部署判定其网关有权获知时开启）。开启的路由由 PiAiAdapter 发送 x-deepseek-harness-session-id = String(GenerateOptions.sessionId)，与 dsh-llm-deepseek 同名（实测 opencode Go 接受该头名）；会话头在 profile.headers 之后合并，同名的部署条目被覆盖而非采信；仅在 opt-in 且调用方携带 sessionId 时发送。settings.yaml 已为 opencode / opencode-live-anthropic / opencode-live-responses / opencode-live 四个路由开启（备份 C:\\Users\\Administrator\\.dsh\\backups\\settings.yaml.20260918-090422.*.bak）。改动已通过 official-patches/apply-patches.mjs 的 7 条补丁持久化，从纯净官方源应用后与运行时副本逐字节一致。验证通过后已用 disable-plugin.mjs 摘除 dsh-opencode-session-id 插件（备份 web-package.json.20260918-090747.*.bak、cordis.patch.yml.20260918-090510.*.bak）。"
related_files:
  - "packages/llm/llm-pi-ai/src/config.ts"
  - "packages/llm/llm-pi-ai/src/adapter.ts"
  - "packages/llm/llm-pi-ai/tests/adapter.spec.ts"
  - "packages/llm/llm-pi-ai/README.md"
  - "packages/llm/llm-pi-ai/README.zh.md"
  - ".agents/notes/implemented/feature/2026-09-17-harness-session-header-route-opt-in.md"
  - "E:\\DSH\\DSH-ops\\official-patches\\apply-patches.mjs"
  - "C:\\Users\\Administrator\\.dsh\\settings.yaml"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
---

排查（全部实测，非推断）：

1) 直连探测 opencode Go：GET https://opencode.ai/zen/go/v1/models → 200，密钥有效，union-alpha 在列。对照实验（同 key、同 anthropic-version）：union-alpha → 503 "Endpoint is unavailable"（同 session 首次 200 但耗时 50.9s，第二次即 503）；qwen3.8-flash / minimax-m3 / deepseek-v4.1-flash 均 200。协议横切：union-alpha 在 /v1/chat/completions 与 /v1/responses 返回 500；gpt-5.6-luna 在 /v1/responses → 200。结论：union-alpha 是上游容量问题（限时免费模型，Free/Unlimited/limited time），与本次适配器缺陷无关。

2) 会话头要求实测：不带任何会话头 → 400 {"type":"MissingSessionID"}；带 x-opencode-session → 200；带 x-deepseek-harness-session-id → 200；带 x-session-id（completions 路径）→ 200；带 x-session-affinity → 400（不被接受）。即 opencode 接受 DSH 原生头名，pi-ai 自带的 sendSessionAffinityHeaders 机制（发 x-session-affinity）不可用。

3) 定位缺口：全仓 grep 显示只有 packages/web/web-search-deepseek/src/provider.ts 发 x-opencode-session（硬编码 'dsh-web-search'），llm-deepseek 的两个协议适配器发 x-deepseek-harness-session-id / -user-id，而 packages/llm/llm-pi-ai 的 PiAiAdapter 的 requestHeaders() 只合并 profile.headers + User-Agent attribution，不发送任何会话身份。与 opencode 文档 "Known Problematic Clients" 对 DeepSeek Harness 的描述完全吻合。

4) 修复与验证：新增 provider profile 字段 harnessSessionHeader（默认关）；集成测试 llm-pi-ai 整包 329 passed（含新增 3 个：opt-in 发送并覆盖同名 profile 条目、默认关不发、无 caller session 不发、非布尔值加载即拒）；typecheck / build / lint(0 错) / verify-agent-note-format / verify-translation-pairing / verify-doc-refs 全绿。

5) 端到端独立验证：先用 disable-plugin.mjs 真正摘除 dsh-opencode-session-id（注意：仅注释 cordis.patch.yml 的 entry 无效，bundle 层仍会加载，dump-config 证实），重启后 `node apps/cli/lib/bin.js --profile web --dump-config` 输出中 opencode-session-id 已消失（168 entries）；会话日志 llm/retry 全局 20 条全部止于 2026-09-17 18:11:57（修复前），第二次重启后 16 个事件零失败、2 条成功的 assistant/message（provider=opencode-live, model=deepseek-v4.1-flash）。在没有任何其他机制发送会话头的前提下调用成功，即原生路径生效的证明。

6) 持久化：official-patches/apply-patches.mjs 新增 7 条精确替换（config.ts ×2、adapter.ts ×3、tests/adapter.spec.ts ×2）。用未打补丁的纯净官方 checkout E:\DSH\Deepseek_DSH 做锚点唯一性校验（每条 old 恰好出现 1 次）与全量试跑，应用结果与工作副本逐字节一致（filecmp 验证）。试跑时曾发现两条 test 补丁的 new 漏写锚点原文、会删除原有测试，被逐字节比对抓出并修正。

遗留：README（英/中）、docs/config-catalog（英/中）、Agent Note 三件套的改动只存在于运行时副本中（该目录被 DSH-ops/.gitignore 忽略），下次 sync-official.ps1 会覆盖；它们属上游贡献物，未做补丁化。
