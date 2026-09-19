/**
 * apply-patches.mjs — 对官方源码应用个人补丁（精确文本替换, fail-loud）
 *
 * 官方 checkout 永远纯净; 个人修复以精确替换对的形式集中在此文件维护。
 * 每次官方升级后由 sync-official.ps1 / bootstrap-personal.ps1 调用:
 * 目标文本必须恰好出现 1 次, 否则 fail-loud（防静默漏补/错补）。
 *
 * 用法: node apply-patches.mjs <packages目录>
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (!target) {
  console.error('usage: node apply-patches.mjs <packages目录>')
  process.exit(1)
}

const patches = [
  {
    file: 'client/connection/src/rpc-host.ts',
    why: 'connection rpc.handle 崩溃修复(owner.root.webServer)',
    old: '() => owner.webServer.register(route),',
    new: '() => owner.root.webServer.register(route),',
  },
  {
    file: 'session/session-format-v0-to-v1/src/payload-validation.ts',
    why: 'v2→v3 迁移链接受 released descriptor version 2',
    old: "literalValue(data['version'], [3], `${label} version`)",
    new: "literalValue(data['version'], [2, 3], `${label} version`)",
  },
  {
    file: 'web/web-search-deepseek/src/provider.ts',
    why: 'web_search 经 OpenCode Zen Go 网关: 补 x-opencode-session 头(缺失为硬 400)',
    // 该 provider 用原生 fetch 直连, 不经过 ctx.llm, 因此拿不到会话适配器注入的
    // session 头; 网关(https://opencode.ai/docs/go)要求每个会话发送稳定的
    // x-opencode-session, 否则 400 "Request is missing x-opencode-session".
    // 该头对 DeepSeek 官方端点是未知头, 会被忽略, 无害; 值可用
    // DSH_OPENCODE_SESSION_ID 覆盖, 默认固定值(仅用于路由与提示缓存亲和).
    old: "          'content-type': 'application/json',\n"
      + "          'accept': 'application/json',\n"
      + "          'user-agent': USER_AGENT,\n"
      + '        },',
    new: "          'content-type': 'application/json',\n"
      + "          'accept': 'application/json',\n"
      + "          'user-agent': USER_AGENT,\n"
      + "          'x-opencode-session': process.env.DSH_OPENCODE_SESSION_ID ?? 'dsh-web-search',\n"
      + '        },',
  },
  {
    file: "llm/llm-pi-ai/src/config.ts",
    why: "llm-pi-ai: 新增 harnessSessionHeader 档案字段(默认关, 声明该路由接收 Harness 会话身份)",
    old: "  /** Provider request headers, validated against Fetch when the profile resolves; Harness attribution wins reserved names. */\n  headers?: Record<string, string>\n  /** Provider-neutral pi-ai reasoning level. */",
    new: "  /** Provider request headers, validated against Fetch when the profile resolves; Harness attribution wins reserved names. */\n  headers?: Record<string, string>\n  /**\n   * Send the Harness session header (`x-deepseek-harness-session-id`) on this\n   * route's model requests, carrying the conversation the request belongs to.\n   * Off by default: the value identifies one conversation, so a route carries\n   * it only where the deployment decides its gateway is entitled to it. A\n   * gateway that routes per conversation requires it and answers a request\n   * without it with HTTP 400 `MissingSessionID` (opencode.ai since 2026-09-05).\n   */\n  harnessSessionHeader?: boolean\n  /** Provider-neutral pi-ai reasoning level. */",
  },
  {
    file: "llm/llm-pi-ai/src/config.ts",
    why: "llm-pi-ai: harnessSessionHeader 的运行时 schema 校验(boolean)",
    old: "  headers: z.dict(z.string()),\n  reasoning: z.union(THINKING_LEVELS),\n",
    new: "  headers: z.dict(z.string()),\n  harnessSessionHeader: z.boolean(),\n  reasoning: z.union(THINKING_LEVELS),\n",
  },
  {
    file: "llm/llm-pi-ai/src/adapter.ts",
    why: "llm-pi-ai: 请求头合并加入 Harness 会话头(覆盖同名的部署条目)",
    old: "/** Merge deployment headers while removing case-insensitive attribution collisions. */\nfunction requestHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {\n  const attribution = attributionHeaders()\n  const reserved = new Set(Object.keys(attribution).map(name => name.toLowerCase()))\n  return {\n    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),\n    ...attribution,\n  }\n}",
    new: "/**\n * The header a Harness-owned conversation identity travels on, under the same\n * name `dsh-llm-deepseek` sends on its own provider requests. A gateway that\n * recognizes the Harness as a client routes and prompt-caches per conversation\n * from it, and opencode.ai answers a request without it with HTTP 400\n * `MissingSessionID`.\n */\nconst HARNESS_SESSION_HEADER = 'x-deepseek-harness-session-id'\n\n/**\n * Merge deployment headers, the Harness session header, and attribution into\n * one provider request header set.\n *\n * A profile entry naming the session header is overridden rather than trusted:\n * the value must name the conversation this request belongs to, which only the\n * request knows. Attribution names are Harness-owned and win collisions for the\n * same reason.\n * @param headers - deployment headers configured on the route.\n * @param sessionId - the conversation to name, or undefined when the route did not opt in or the caller named none.\n * @returns the headers to send.\n */\nfunction requestHeaders(\n  headers: Readonly<Record<string, string>> | undefined,\n  sessionId: string | undefined,\n): Record<string, string> {\n  const attribution = attributionHeaders()\n  const reserved = new Set(Object.keys(attribution).map(name => name.toLowerCase()))\n  return {\n    ...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),\n    ...sessionId === undefined ? {} : { [HARNESS_SESSION_HEADER]: sessionId },\n    ...attribution,\n  }\n}",
  },
  {
    file: "llm/llm-pi-ai/src/adapter.ts",
    why: "llm-pi-ai: 仅当路由 opt-in 且调用方携带 sessionId 时取该会话值",
    old: "    const apiKey = await this.config.resolveApiKey(options.provider, profile)",
    new: "    const apiKey = await this.config.resolveApiKey(options.provider, profile)\n    // Only a route that opted in carries a conversation identity, and only a\n    // caller that named one has it to carry.\n    const sessionId = profile.harnessSessionHeader === true && options.sessionId !== undefined\n      ? String(options.sessionId)\n      : undefined",
  },
  {
    file: "llm/llm-pi-ai/src/adapter.ts",
    why: "llm-pi-ai: 把会话值交给请求头合并",
    old: "        // Profile headers are deployment-owned; attribution names are\n        // Harness-owned and therefore win collisions.\n        headers: requestHeaders(profile.headers),",
    new: "        // Profile headers are deployment-owned; the session header and\n        // attribution names are Harness-owned and therefore win collisions.\n        headers: requestHeaders(profile.headers, sessionId),",
  },
  {
    file: "llm/llm-pi-ai/tests/adapter.spec.ts",
    why: "llm-pi-ai: 固定 opt-in 会话头的三种状态与同名覆盖(回归保护)",
    old: "    expect(server.headers[0]?.['x-company']).toBe('private')\n    expect(server.headers[0]?.['user-agent']).toBe(userAgent())\n  })\n",
    new: "    expect(server.headers[0]?.['x-company']).toBe('private')\n    expect(server.headers[0]?.['user-agent']).toBe(userAgent())\n  })\n\n  it('sends the Harness session header on an opted-in route, overriding a profile entry of the same name', async () => {\n    const server = await mockServer([{ events: textEvents }])\n    const ctx = await harness(server.url, {\n      harnessSessionHeader: true,\n      headers: { 'x-deepseek-harness-session-id': 'stale-from-config' },\n    })\n    await assemble(ctx, {\n      model: 'deepseek-v4-flash',\n      messages: [],\n      sessionId: 'session-live' as never,\n    })\n    expect(server.headers[0]?.['x-deepseek-harness-session-id']).toBe('session-live')\n  })\n\n  it('omits the Harness session header without the route opt-in or a caller session', async () => {\n    const notOptedIn = await mockServer([{ events: textEvents }])\n    await assemble(await harness(notOptedIn.url), {\n      model: 'deepseek-v4-flash',\n      messages: [],\n      sessionId: 'session-unused' as never,\n    })\n    expect(notOptedIn.headers[0]).not.toHaveProperty('x-deepseek-harness-session-id')\n\n    const noCallerSession = await mockServer([{ events: textEvents }])\n    await assemble(await harness(noCallerSession.url, { harnessSessionHeader: true }), {\n      model: 'deepseek-v4-flash',\n      messages: [],\n    })\n    expect(noCallerSession.headers[0]).not.toHaveProperty('x-deepseek-harness-session-id')\n  })\n",
  },
  {
    file: "llm/llm-pi-ai/tests/adapter.spec.ts",
    why: "llm-pi-ai: 插件加载处拒绝非布尔 harnessSessionHeader",
    old: "  it('rejects invalid nested retryPolicy at the provider-profile boundary', async () => {",
    new: "  it('rejects a non-boolean harnessSessionHeader at plugin load', async () => {\n    const ctx = new Context()\n    await ctx.plugin(LlmRuntime)\n    await expect(ctx.plugin(LlmPiAi, {\n      providers: { openai: { harnessSessionHeader: 'yes' } as never },\n    })).rejects.toThrow()\n  })\n\n  it('rejects invalid nested retryPolicy at the provider-profile boundary', async () => {",
  },
  {
    file: "llm/llm-pi-ai/README.md",
    why: "llm-pi-ai README: 字段表补 harnessSessionHeader 行",
    old: "| `baseURL` | catalog endpoint | Endpoint of every model on the route |\n| `models` | installed catalog | Replaces the route's catalog wholesale; each entry defaults from the installed model |",
    new: "| `baseURL` | catalog endpoint | Endpoint of every model on the route |\n| `harnessSessionHeader` | off | Sends `x-deepseek-harness-session-id` carrying the conversation id on this route's model requests; a gateway that routes per conversation requires it (opencode.ai answers HTTP 400 `MissingSessionID` without one) |\n| `models` | installed catalog | Replaces the route's catalog wholesale; each entry defaults from the installed model |",
  },
  {
    file: "llm/llm-pi-ai/README.md",
    why: "llm-pi-ai README: 说明该开关的语义与默认关闭原因",
    old: "Each profile may set a `retryPolicy`; omission uses normal mode with five retries. `apiKeyEnv` is a credential reference resolved per request through the harness credential seam, so no secret enters the configuration file; a reference that resolves to nothing fails the request with `MISSING_CREDENTIAL`. Omitting it leaves the route configured-but-keyless, which for an installed catalog route defers to pi-ai's provider-native ambient discovery.",
    new: "Each profile may set a `retryPolicy`; omission uses normal mode with five retries. `apiKeyEnv` is a credential reference resolved per request through the harness credential seam, so no secret enters the configuration file; a reference that resolves to nothing fails the request with `MISSING_CREDENTIAL`. Omitting it leaves the route configured-but-keyless, which for an installed catalog route defers to pi-ai's provider-native ambient discovery.\n\n`harnessSessionHeader` defaults to off because the header names one conversation: a route carries that identity only where the deployment decides its gateway is entitled to it. Enable it for a gateway that routes and prompt-caches per conversation — opencode.ai has required a session header since 2026-09-05 and answers a request without one with HTTP 400 `MissingSessionID`, which makes every model on that gateway unreachable. The value is `GenerateOptions.sessionId`, so a route with the switch on still sends nothing when the caller names no session, and a deployment entry in `headers` under the same name is overridden rather than trusted.",
  },
  {
    file: "llm/llm-pi-ai/README.zh.md",
    why: "llm-pi-ai README(中): 字段表补 harnessSessionHeader 行",
    old: "| `baseURL` | 目录端点 | 路由上所有模型的端点 |\n| `models` | 已安装目录 | 整体替换路由目录；每个条目从已安装模型取默认值 |",
    new: "| `baseURL` | 目录端点 | 路由上所有模型的端点 |\n| `harnessSessionHeader` | 关闭 | 在该路由的模型请求上发送携带对话 id 的 `x-deepseek-harness-session-id`；按对话路由的网关要求它（opencode.ai 缺少时返回 HTTP 400 `MissingSessionID`） |\n| `models` | 已安装目录 | 整体替换路由目录；每个条目从已安装模型取默认值 |",
  },
  {
    file: "llm/llm-pi-ai/README.zh.md",
    why: "llm-pi-ai README(中): 说明该开关的语义与默认关闭原因",
    old: "每个 profile 都可以设置 `retryPolicy`；省略时使用 normal mode、最多重试五次。`apiKeyEnv` 是按请求经 harness 凭据 seam 解析的凭据引用，因此配置文件绝不包含密钥；解析为空的引用会让请求以 `MISSING_CREDENTIAL` 失败。省略它会让路由保持已配置但无密钥（configured-but-keyless）状态，对已安装目录路由而言即交由 pi-ai 提供方原生的环境发现。",
    new: "每个 profile 都可以设置 `retryPolicy`；省略时使用 normal mode、最多重试五次。`apiKeyEnv` 是按请求经 harness 凭据 seam 解析的凭据引用，因此配置文件绝不包含密钥；解析为空的引用会让请求以 `MISSING_CREDENTIAL` 失败。省略它会让路由保持已配置但无密钥（configured-but-keyless）状态，对已安装目录路由而言即交由 pi-ai 提供方原生的环境发现。\n\n`harnessSessionHeader` 默认关闭，因为该标头点名的是一个对话：只有部署判定其网关有权获知该身份的路由才携带它。为按对话路由并做提示缓存的网关开启它——opencode.ai 自 2026-09-05 起要求会话标头，缺失时返回 HTTP 400 `MissingSessionID`，使该网关上所有模型不可达。其取值来自 `GenerateOptions.sessionId`，因此即便开关打开，调用方未点名会话时路由仍不发送任何内容；`headers` 中同名的部署条目会被覆盖而非采信。",
  },
  {
    file: "client/ui-conversation/src/client/skeleton/InputBar.module.css",
    why: "个人胶囊行独占一行: 官方 .dock 是 nowrap 横向 flex, 官方 stats 胶囊/个人胶囊行/ContextMeter 会挤在同一行",
    old: ".dock {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  max-width: 100%;\n  padding-top: 4px;\n}",
    new: ".dock {\n  display: flex;\n  /* Personal plugins add a full-width capsule row here (id `personal-bar`).\n     Without wrapping, that row shares this single nowrap line with the shipped\n     stats pills and ContextMeter and is shrunk to fit. Wrapping lets a\n     width:100% entry claim a line of its own while the shipped entries keep the\n     first line. Local patch: official-patches/apply-patches.mjs. */\n  flex-wrap: wrap;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  max-width: 100%;\n  padding-top: 4px;\n}",
  },
  {
    file: "client/ui-plugin-manager/src/client/presentation.ts",
    why: "插件管理页显示部署提供的中文名/说明: 官方 packageText() 对非内置包只拿 shortName(包名) 当标题, 读不到任何自定义字段",
    // packageText() 是卡片标题的唯一来源(PluginManagerPage.tsx 303/380/425/819
    // 四处消费), 而 BundleInfo(boot/plugin-manager/src/types.ts:33-53) 与
    // PackageView(ui-plugin-manager/src/client/manager-store.ts:67-82) 都没有
    // title/label 字段, BUILTIN_COPY 只登记 3 个官方包(Agent Teams x2 + auto-review)。
    // 这里加一层"部署提供的覆盖表": 表由个人 client 插件在页面渲染前挂到
    // globalThis.__DSH_PLUGIN_COPY__; 命中则用其中的中文名/说明, 未命中保持官方原行为。
    // 补丁本身不含任何文案字符串, 所以不触发 verify-client-ui-i18n(该门禁要求官方
    // client 文案一律走 locale 字典)——文案全部留在个人插件侧。
    old: "  const keys = BUILTIN_COPY.get(pkg.name)\n  return keys === undefined\n",
    new: "  const keys = BUILTIN_COPY.get(pkg.name)\n"
      + "  // Deployment-supplied copy for packages the shipped map does not name. A\n"
      + "  // self-developed client plugin publishes the table on the global object\n"
      + "  // before the page renders, so a deployment can localize a title without a\n"
      + "  // locale entry per package. Unset, malformed, or missing this package's key\n"
      + "  // leaves the shipped derivation below untouched.\n"
      + "  const supplied = keys === undefined ? deploymentCopy()[pkg.name] : undefined\n"
      + "  if (supplied !== undefined) {\n"
      + "    return { title: supplied.title, description: supplied.description ?? pkg.description, beta: false }\n"
      + "  }\n"
      + "  return keys === undefined\n",
  },
  {
    file: "client/ui-plugin-manager/src/client/presentation.ts",
    why: "同上: 在 shortName() 之后追加 deploymentCopy() 读取器(表缺失时返回空对象, 不抛错)",
    old: "export function shortName(name: string): string {\n  const unscoped = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name\n  return unscoped.replace(/^dsh-(?:host-|client-)?/, '')\n}\n",
    new: "export function shortName(name: string): string {\n  const unscoped = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name\n  return unscoped.replace(/^dsh-(?:host-|client-)?/, '')\n}\n"
      + "\n"
      + "/**\n"
      + " * Read the deployment's display-copy table, keyed by exact package name.\n"
      + " *\n"
      + " * The global name is a private agreement between this manager and the\n"
      + " * deployment's own client plugins; it is absent in every shipped profile. An\n"
      + " * unset or mistyped table yields no entries rather than an error, so the\n"
      + " * shipped derivation in {@link packageText} stays the fallback.\n"
      + " * @returns the published table, or an empty object when none is published.\n"
      + " */\n"
      + "function deploymentCopy(): Record<string, { title: string; description?: string }> {\n"
      + "  const table = (globalThis as { __DSH_PLUGIN_COPY__?: unknown }).__DSH_PLUGIN_COPY__\n"
      + "  return table !== null && typeof table === 'object' && !Array.isArray(table)\n"
      + "    ? table as Record<string, { title: string; description?: string }>\n"
      + "    : {}\n"
      + "}\n",
  },
  {
    file: "experimental/agent-team/src/types.ts",
    why: "队友可选模型(1/3): types.ts 声明客户端安全的 TeammateAgentOptions（不得引入 Host 面 AgentOptions）",
    // 关键教训: types.ts 经本包的 ./client 出口被 client half 传递性引入。若在此
    // import Host 面的 @deepseek-ai/dsh-agent, 会把它的
    //   declare module '@deepseek-ai/cordis' { interface Context { sessions: SessionStore } }
    // Context 合并带进每个 client 编译单元, 使 ctx.sessions 解析为 Host 类而非 client
    // 面的 ISessions, client-ui-agent-team/src/client/mount.ts 随即报三处 TS2339
    // (binding/refreshSubagents/retainInfo), 并阻断全量 pnpm run build。
    // 故此处只声明结构等价的本地类型。见 buglog agent-team-host-type-leak-client。
    old: "import type { SessionId } from '@deepseek-ai/dsh-session/types'\n",
    new: "import type { SessionId } from '@deepseek-ai/dsh-session/types'\n"
      + "\n"
      + "/**\n"
      + " * Child LLM route for one teammate.\n"
      + " *\n"
      + " * Declared here instead of importing the Host's `AgentOptions` from\n"
      + " * `@deepseek-ai/dsh-agent`: this module is re-exported through the package's\n"
      + " * `./client` entry, whose contract is client-safe vocabulary. A Host-face\n"
      + " * import there drags that package's `declare module '@deepseek-ai/cordis'`\n"
      + " * Context merge into every client compilation unit, where `ctx.sessions` then\n"
      + " * resolves to the Host `SessionStore` class rather than the client's own\n"
      + " * sessions service. The fields are structurally identical to `AgentOptions`,\n"
      + " * so a caller may pass one directly.\n"
      + " */\n"
      + "export interface TeammateAgentOptions {\n"
      + "  /** Provider route for the teammate's model. */\n"
      + "  readonly provider?: string\n"
      + "  /** Model id interpreted by the provider adapter. */\n"
      + "  readonly model?: string\n"
      + "}\n",
  },
  {
    file: "experimental/agent-team/src/types.ts",
    why: "队友可选模型(2/3): SpawnTeammateRequest 增加 agentOptions 字段",
    // 上游契约只有 provider(且语义是 subagent provider: spawn/fork), 没有任何
    // LLM 路由字段, 因此队友必然继承 Lead 的模型。SubagentStartRequest 本来就
    // 接受 agentOptions(subagent/src/index.ts 的 cap 检查), 只是没有被透传。
    old: "export interface SpawnTeammateRequest {\n"
      + "  readonly name: string\n"
      + "  readonly description: string\n"
      + "  readonly prompt: ContentBlock[]\n"
      + "  readonly context: 'fresh' | 'fork'\n"
      + "  readonly provider: string\n"
      + "  readonly signal: AbortSignal\n"
      + "}\n",
    new: "export interface SpawnTeammateRequest {\n"
      + "  readonly name: string\n"
      + "  readonly description: string\n"
      + "  readonly prompt: ContentBlock[]\n"
      + "  readonly context: 'fresh' | 'fork'\n"
      + "  readonly provider: string\n"
      + "  /** Child LLM route for this teammate; omitted means the child inherits the Lead's route. */\n"
      + "  readonly agentOptions?: TeammateAgentOptions\n"
      + "  readonly signal: AbortSignal\n"
      + "}\n",
  },
  {
    file: "experimental/agent-team/src/roster.ts",
    why: "队友可选模型(3/3): roster 把 agentOptions 透传给 startContinuable",
    old: "        request: {\n"
      + "          prompt: request.prompt,\n"
      + "          parent: root,\n"
      + "        },\n",
    new: "        request: {\n"
      + "          prompt: request.prompt,\n"
      + "          parent: root,\n"
      + "          ...request.agentOptions === undefined ? {} : { agentOptions: request.agentOptions },\n"
      + "        },\n",
  },
  {
    file: "experimental/tool-agent-team/src/index.ts",
    why: "队友可选模型: 工具层引入 AgentOptions 类型",
    old: "import type { Agent } from '@deepseek-ai/dsh-agent'\n",
    new: "import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'\n",
  },
  {
    file: "experimental/tool-agent-team/src/index.ts",
    why: "队友可选模型: spawn_teammate 暴露 provider/model 并加与 subagent 一致的授权校验",
    // 上游 spawn_teammate 只接受 name/description/prompt/context, 队友永远继承
    // Lead 的模型, 团队模式无法按任务分派强弱模型。这里补上 provider/model 两个
    // 参数, 并在调用点按部署设置 subagent-model-selection 授权(与 tool-subagent
    // 的 assertAllowedModelSelection 同源语义: 显式选择必须命中 allowedModels,
    // 未开启选择则拒绝)。settings 是可选服务, 用 ctx.get 读取, 缺失时不校验。
    old: "        context: {\n"
      + "          type: 'string',\n"
      + "          enum: ['fresh', 'fork'],\n"
      + "          description: 'fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.',\n"
      + "        },\n"
      + "      },\n"
      + "      output: jsonOutput(SPAWN_VALUE_SCHEMA),\n"
      + "      async execute(args, exec) {\n"
      + "        const agent = callingAgent(exec.agent, 'spawn_teammate')\n"
      + "        const context = args.context ?? 'fresh'\n"
      + "        return await ctx.agentTeams.spawnTeammate(agent, {\n",
    new: "        context: {\n"
      + "          type: 'string',\n"
      + "          enum: ['fresh', 'fork'],\n"
      + "          description: 'fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.',\n"
      + "        },\n"
      + "        provider: {\n"
      + "          type: 'string',\n"
      + "          description: 'LLM provider route for the teammate. Supply together with model; omit both to inherit the Lead route.',\n"
      + "        },\n"
      + "        model: {\n"
      + "          type: 'string',\n"
      + "          description: 'Model id interpreted by provider. Supply together with provider; omit both to inherit the Lead route.',\n"
      + "        },\n"
      + "      },\n"
      + "      output: jsonOutput(SPAWN_VALUE_SCHEMA),\n"
      + "      async execute(args, exec) {\n"
      + "        const agent = callingAgent(exec.agent, 'spawn_teammate')\n"
      + "        const context = args.context ?? 'fresh'\n"
      + "        const agentOptions = teammateAgentOptions(ctx, args)\n"
      + "        return await ctx.agentTeams.spawnTeammate(agent, {\n",
  },
  {
    file: "experimental/tool-agent-team/src/index.ts",
    why: "队友可选模型: 追加 teammateAgentOptions() 组装与授权校验",
    old: "/** Recover the exact caller guaranteed by Agent-scoped tool discovery. */\n",
    new: "/**\n"
      + " * Resolve the LLM route one `spawn_teammate` call asked for, enforcing the\n"
      + " * deployment's `subagent-model-selection` authorization the way the\n"
      + " * `subagent` tool does: an explicit route must appear in `allowedModels`,\n"
      + " * and an unset `enabled` refuses explicit selection altogether. A teammate\n"
      + " * carries no route of its own upstream, so without this the Lead's route is\n"
      + " * silently inherited and team mode cannot place work on a cheaper model.\n"
      + " * @param ctx - plugin context owning the optional `settings` service.\n"
      + " * @param args - model-facing route fields from the tool call.\n"
      + " * @returns the child options, or undefined when the call selected no route.\n"
      + " */\n"
      + "function teammateAgentOptions(\n"
      + "  ctx: Context,\n"
      + "  args: { readonly provider?: string; readonly model?: string },\n"
      + "): AgentOptions | undefined {\n"
      + "  if (args.provider === undefined && args.model === undefined) return undefined\n"
      + "  if ((args.provider === undefined) !== (args.model === undefined)) {\n"
      + "    throw new Error('teammate LLM `provider` and `model` must be supplied together')\n"
      + "  }\n"
      + "  const settings = ctx.get('settings')\n"
      + "  const raw = settings?.get('subagent-model-selection') as\n"
      + "    | { readonly enabled?: boolean; readonly allowedModels?: readonly { readonly provider: string; readonly model: string }[] }\n"
      + "    | undefined\n"
      + "  if (raw?.enabled !== true) {\n"
      + "    throw new Error('teammate model selection is disabled by the deployment settings')\n"
      + "  }\n"
      + "  if (!(raw.allowedModels ?? []).some(route => route.provider === args.provider && route.model === args.model)) {\n"
      + "    throw new Error(`teammate LLM route \"${String(args.provider)}/${String(args.model)}\" is not allowed by the deployment settings`)\n"
      + "  }\n"
      + "  return { provider: args.provider, model: args.model } as AgentOptions\n"
      + "}\n"
      + "\n"
      + "/** Recover the exact caller guaranteed by Agent-scoped tool discovery. */\n",
  },
  {
    file: "experimental/tool-agent-team/src/index.ts",
    why: "队友可选模型: 把算出的 agentOptions 真正传进 spawnTeammate 调用",
    // 与上一条同属一处改动；单独列出是因为漏了它 tsc 会报 TS6133
    // 'agentOptions is declared but its value is never read'，即模型参数被算了却没生效。
    old: "          context,\n"
      + "          provider: context === 'fork' ? config.forkProvider : config.freshProvider,\n"
      + "          signal: exec.signal,\n"
      + "        })\n",
    new: "          context,\n"
      + "          provider: context === 'fork' ? config.forkProvider : config.freshProvider,\n"
      + "          ...agentOptions === undefined ? {} : { agentOptions },\n"
      + "          signal: exec.signal,\n"
      + "        })\n",
  },
]

const failures = []
for (const patch of patches) {
  const path = join(target, ...patch.file.split('/'))
  if (!existsSync(path)) {
    failures.push(`${patch.file}: 文件缺失`)
    continue
  }
  const text = readFileSync(path, 'utf8')
  const count = text.split(patch.old).length - 1
  if (count !== 1) {
    failures.push(`${patch.file}: 目标文本出现 ${count} 次（期望 1 次）——官方升级可能改动该处, 需人工核对`)
    continue
  }
  writeFileSync(path, text.replace(patch.old, patch.new), 'utf8')
  console.log(`  ✓ ${patch.file} — ${patch.why}`)
}

/**
 * 个人文件恢复。官方同步（sync-official）会删除官方 checkout 中不存在的文件，
 * 因此个人决策记录与个人补丁带来的文档每次同步后都需要重建。内容以本目录
 * notes/ 为唯一真相源，始终覆盖写入；`to` 相对仓库根（<target> 的父目录）。
 */
const restore = [
  {
    from: 'notes/2026-09-17-harness-session-header-route-opt-in.md',
    to: '.agents/notes/implemented/feature/2026-09-17-harness-session-header-route-opt-in.md',
    why: '个人决策记录: llm-pi-ai 按路由 opt-in 发送 Harness 会话头',
  },
  {
    from: 'notes/2026-09-17-harness-session-header-route-opt-in.zh.md',
    to: '.agents/notes/implemented/feature/2026-09-17-harness-session-header-route-opt-in.zh.md',
    why: '同上（中文对照）',
  },
  {
    from: 'notes/2026-09-17-harness-session-header-route-opt-in.i18n.yaml',
    to: '.agents/notes/implemented/feature/2026-09-17-harness-session-header-route-opt-in.i18n.yaml',
    why: '该笔记的双语一致性记录',
  },
  {
    from: 'notes/llm-pi-ai-README.i18n.yaml',
    to: 'packages/llm/llm-pi-ai/README.i18n.yaml',
    why: 'README 补丁改了两侧内容, 其一致性记录须与补丁后的内容配套',
  },
  {
    from: 'notes/config-catalog.md',
    to: 'docs/config-catalog.md',
    why: '由 src JSDoc 生成; 含补丁新增字段, 官方版本会覆盖为不含该字段的旧内容',
  },
  {
    from: 'notes/config-catalog.zh.md',
    to: 'docs/config-catalog.zh.md',
    why: '生成器只写英文侧, 中文侧为手工同步',
  },
  {
    from: 'notes/config-catalog.i18n.yaml',
    to: 'docs/config-catalog.i18n.yaml',
    why: '配置目录的双语一致性记录',
  },
]

const repoRoot = basename(resolve(target)) === 'packages' ? dirname(resolve(target)) : resolve(target)
for (const item of restore) {
  const source = fileURLToPath(new URL(item.from, import.meta.url))
  if (!existsSync(source)) {
    failures.push(`${item.from}: 恢复源缺失`)
    continue
  }
  const destination = join(repoRoot, ...item.to.split('/'))
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, readFileSync(source))
  console.log(`  \u2713 restore ${item.to} \u2014 ${item.why}`)
}

if (failures.length > 0) {
  console.log('补丁应用失败:')
  for (const f of failures) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('全部补丁应用成功 OK')