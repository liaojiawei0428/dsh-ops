// 一次性深挖：用 cost、token 计数（多 prompt）、owned_by、自述，判定 deepseek-flash 与 deepseek-v4.1-flash 的关系
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}

// 端点元数据
const listing = await (await fetch('https://opencode.ai/zen/go/v1/models', {
  headers: { accept: 'application/json', authorization: `Bearer ${key}` },
})).json()
console.log('== /models 元数据 ==')
for (const e of listing.data ?? []) {
  if (String(e.id).includes('deepseek')) console.log('  ', JSON.stringify(e))
}

const url = 'https://opencode.ai/zen/go/v1/chat/completions'
async function call(model, prompt) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-opencode-session': 'session-' + randomUUID() },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 120, stream: false }),
  })
  const body = await res.json()
  return {
    status: res.status,
    promptTokens: body.usage?.prompt_tokens,
    completionTokens: body.usage?.completion_tokens,
    cost: body.cost,
    content: (body.choices?.[0]?.message?.content ?? '').slice(0, 160).replace(/\s+/g, ' '),
  }
}

const prompts = [
  'Reply with exactly: OK',
  'Count from 1 to 5.',
  'What is 17 * 23? Answer with the number only.',
  'Which exact model and version are you? State the model name you were told to identify as.',
]
const models = ['deepseek-v4.1-flash', 'deepseek-flash', 'deepseek-v4-flash']
console.log('\n== 逐 prompt 对比（promptTokens / cost）==')
for (const p of prompts) {
  console.log(`\nprompt: ${p.slice(0, 50)}`)
  for (const m of models) {
    const r = await call(m, p)
    console.log(`  ${m.padEnd(20)} tokens=${String(r.promptTokens).padStart(3)}/${String(r.completionTokens).padStart(3)}  cost=${r.cost}  content="${r.content}"`)
  }
}