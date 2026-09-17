---
date: "2026-09-14T02:18:30.792Z"
symptom: "自定义命名（非 opencode/opencode-go）的 opencode Go 路由无法调用：能\"获取模型\"拉到列表，但任何推理请求都 400 MissingSessionID；用户自建配置必然失败。"
component: "dsh-opencode-session-id"
severity: "major"
status: "fixed"
root_cause: "dsh-opencode-session-id 的会话头注入带有 provider 名白名单，而默认白名单只含 pi-ai 目录路由名 ['opencode','opencode-go']。scopedStream 对不在白名单的 provider 直接 return next()，跳过令牌作用域设置，于是包装后的 fetch 无令牌可注入，自定义命名的 opencode 路由（任意用户自建名或本次新增的 opencode-live* 系列）在真实推理请求上一律 400 MissingSessionID。"
fix: "① cordis.patch.yml 中 opencode-session-id 条目加 config: { providers: [] }（不按 provider 名限制，仅按 opencode.ai host 匹配）；② 插件 index.js 的 DEFAULT_PROVIDERS 由 ['opencode','opencode-go'] 改为 []，README 同步说明\"留空是有意为之\"；两处均备份，闸门与回归全绿。"
related_files:
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-opencode-session-id\\index.js"
  - "E:\\DSH\\DSH-ops\\plugins\\dsh-opencode-session-id\\README.md"
  - "C:\\Users\\Administrator\\.dsh\\profiles\\web\\cordis.patch.yml"
---

发现路径：用户报告"自行配置 opencode Go 无法成功，端点需要协议头，需要额外配置"→ 读插件源码 index.js：DEFAULT_PROVIDERS = ['opencode','opencode-go']（第 51-52 行），scopedStream 第 207-210 行 `if (normalized.providers.length > 0 && !normalized.providers.includes(options.provider)) return next()` → 自定义命名的路由（含本次新增的 opencode-live / opencode-live-anthropic / opencode-live-responses）不在白名单，waterfall 直接跳过、不设置 scopedToken，于是包装后的 fetch 没有令牌可注入 → 出站推理请求缺 x-opencode-session → 网关 400。关键掩盖效应：discovery 的 GET /models 不需要该头，所以这些路由的"获取模型"按钮一切正常，只有真正发推理请求才 400——这正是用户"能拉到列表但用不了"的观感。影响面确认为三条新路由全部受影响。修复双保险：① 配置层——~/.dsh/profiles/web/cordis.patch.yml 的 opencode-session-id 条目（位于 personal-hub managed 段之前，可安全手工编辑）显式加 config.providers: []，插件语义为"非空即白名单、空数组不限制"，故此后仅按 host(opencode.ai) 匹配；② 源码层——插件 DEFAULT_PROVIDERS 默认值改为 []（并更新注释与 README 第 3 行/第 21 行表格），防止将来 cordis.patch.yml 被 personal_hub_reapply 或重新生成时回归。验证：validate-plugins 10/10 PASS、test-standard 4/4 PASS（T2/T3 FAIL 为预期负向用例）；wire 层对照证据见 2026-09-07 记录（无头 400 / 带头 200）；备份 index-20260914-101738.js、README-20260914-101738.md、cordis.patch-20260914-101738.yml。端到端确认需重启后在 UI 选一条 opencode-live 的模型发消息。同类风险提示：凡新建指向 opencode.ai 的路由，若插件 providers 被改回非空白名单即会复现，故默认值留空是长期正确形态。
