// 一次性端到端验证：插件注入 + 自定义 provider 名 + 真实 opencode 网关请求 → 期望 200
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { apply } from 'file:///E:/DSH/DSH-ops/plugins/dsh-opencode-session-id/index.js'

const require = createRequire(import.meta.url)
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}

const patch = YAML.parse(readFileSync('C:/Users/Administrator/.dsh/profiles/web/cordis.patch.yml', 'utf8'))
const config = patch.find(e => e.id === 'opencode-session-id')?.config ?? {}

const handlers = []
const ctx = {
  logger: { info: () => {}, warn: m => console.log('[plugin warn]', m), debug: () => {} },
  effect: fn => fn(),
  on: (name, fn) => { if (name === 'llm/stream') handlers.push(fn); return () => {} },
}
apply(ctx, config) // 包装真实 globalThis.fetch

async function call(provider, sessionId, withKey = true) {
  let result = null
  const stream = handlers[0]({ provider, sessionId }, () => (async function* () {
    const res = await globalThis.fetch('https://opencode.ai/zen/go/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(withKey ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: 'deepseek-v4.1-flash',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
    })
    const text = await res.text()
    result = { status: res.status, brief: res.ok ? 'OK' : text.replace(/\s+/g, ' ').slice(0, 150) }
    yield 1
  })())
  for await (const _ of stream) { /* drain */ }
  return result
}

console.log('自定义路由名 opencode-live :', JSON.stringify(await call('opencode-live', 'session-' + crypto.randomUUID())))
console.log('目录路由名 opencode-go    :', JSON.stringify(await call('opencode-go', 'session-' + crypto.randomUUID())))