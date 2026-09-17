// 一次性探活（全量 37 个）：判定每个模型"可用 + 协议"，供生成配置。
// 协议优先序：pi-ai 目录的权威记录 > 同族推断（grok-* → responses，其余 completions）。
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}
const base = 'https://opencode.ai/zen/go/v1'
const session = 'session-' + randomUUID()

const listing = JSON.parse(readFileSync('E:/DSH/DSH-ops/.opencode-listing.json', 'utf8'))
const ids = listing.map(e => e.id)

// pi-ai 目录的权威协议记录
const snap = JSON.parse(readFileSync('E:/DSH/Deepseek_DSH/packages/llm/llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/data/opencode-go.json', 'utf8'))
const known = {}
for (const [api, models] of Object.entries(snap)) for (const id of Object.keys(models)) known[id] = api

async function probe(id, api) {
  const headers = { 'content-type': 'application/json', 'x-opencode-session': session }
  let url, body
  if (api === 'openai-completions') {
    url = `${base}/chat/completions`; headers.authorization = `Bearer ${key}`
    body = { model: id, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }
  } else if (api === 'openai-responses') {
    url = `${base}/responses`; headers.authorization = `Bearer ${key}`
    body = { model: id, input: 'ping', max_output_tokens: 16 }
  } else {
    url = `${base}/messages`; headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'
    body = { model: id, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }
  }
  try {
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
    const t = await r.text()
    return { status: r.status, err: r.ok ? '' : t.replace(/\s+/g, ' ').slice(0, 200) }
  } catch (e) {
    return { status: 0, err: String(e).slice(0, 140) }
  }
}

function order(id) {
  const first = known[id] ?? (id.startsWith('grok-') ? 'openai-responses' : 'openai-completions')
  const rest = ['openai-completions', 'openai-responses', 'anthropic-messages'].filter(a => a !== first)
  return [first, ...rest]
}

const out = {}
let done = 0
async function work(id) {
  const attempts = []
  let ok = null
  for (const api of order(id)) {
    const r = await probe(id, api)
    attempts.push({ api, ...r })
    if (r.status === 200) { ok = api; break }
    // 格式明确不支持（401 not supported）无需再试同族其它协议的先验信息，仍继续下一个
  }
  out[id] = { ok: ok !== null, api: ok, catalogApi: known[id] ?? null, attempts }
  done++
  console.log(`[${String(done).padStart(2)}/${ids.length}] ${id.padEnd(26)} ${ok ? 'OK  ' + ok : 'UNAVAILABLE'}${known[id] ? '  (catalog: ' + known[id] + ')' : '  (NOT in catalog)'}`)
}

const queue = [...ids]
const workers = Array.from({ length: 5 }, async () => {
  while (queue.length > 0) await work(queue.shift())
})
await Promise.all(workers)

writeFileSync('E:/DSH/DSH-ops/.opencode-probe-full.json', JSON.stringify(out, null, 2), 'utf8')
const okIds = ids.filter(i => out[i].ok)
console.log('\n可用:', okIds.length, '/', ids.length)
console.log('不可用:', ids.filter(i => !out[i].ok).join(', '))
console.log('DONE')