// 常备验证：加载 dsh-opencode-session-id 的 apply()（用 cordis.patch.yml 的真实配置），
// 确认自定义命名的 opencode 路由也能拿到 x-opencode-session 头。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { apply } from 'file:///E:/DSH/DSH-ops/plugins/dsh-opencode-session-id/index.js'

const require = createRequire(import.meta.url)
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

// 1) 从真实 profile 配置里取出该插件的 config
const patch = YAML.parse(readFileSync('C:/Users/Administrator/.dsh/profiles/web/cordis.patch.yml', 'utf8'))
const entry = patch.find(e => e.id === 'opencode-session-id')
const config = entry?.config ?? {}
console.log('profile 中的插件配置:', JSON.stringify(config))

// 2) 用 stub fetch 捕获注入结果
const calls = []
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  const headers = new Headers(init?.headers)
  calls.push({ url, session: headers.get('x-opencode-session') })
  return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } })
}

const handlers = []
const ctx = {
  logger: { info: () => {}, warn: m => console.log('[plugin warn]', m), debug: () => {} },
  effect: fn => fn(),
  on: (name, fn) => { if (name === 'llm/stream') handlers.push(fn); return () => {} },
}
apply(ctx, config)
if (handlers.length !== 1) throw new Error('expected one llm/stream listener, got ' + handlers.length)

// 3) 逐场景触发：provider 名 + 目标 URL
async function run(provider, url) {
  calls.length = 0
  const stream = handlers[0]({ provider, sessionId: 'session-abc-123' }, () => (async function* () {
    await globalThis.fetch(url, { method: 'POST' })
    yield 1
  })())
  for await (const _ of stream) { /* drain */ }
  return calls[0]?.session ?? null
}

const cases = [
  ['opencode-live', 'https://opencode.ai/zen/go/v1/chat/completions', true],
  ['opencode-live-anthropic', 'https://opencode.ai/zen/go/v1/messages', true],
  ['opencode-live-responses', 'https://opencode.ai/zen/go/v1/responses', true],
  ['opencode-go', 'https://opencode.ai/zen/go/v1/chat/completions', true],
  ['my-custom-name', 'https://opencode.ai/zen/go/v1/chat/completions', true],
  ['unlimitds', 'https://unlimitds.chat/v1/chat/completions', false],
]
let bad = 0
for (const [provider, url, expect] of cases) {
  const got = await run(provider, url)
  const ok = expect ? got === 'session-abc-123' : got === null
  if (!ok) bad++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  provider=${provider.padEnd(24)} host=${new URL(url).hostname.padEnd(16)} injected=${got ?? 'none'}`)
}
console.log(bad === 0 ? '\nALL PASS' : `\nFAILURES: ${bad}`)
process.exitCode = bad === 0 ? 0 : 1