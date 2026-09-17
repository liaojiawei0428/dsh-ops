// 一次性：判定各 deepseek 模型所属的 tokenizer/模板世代（同一 prompt 的 prompt_tokens）
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}

const url = 'https://opencode.ai/zen/go/v1/chat/completions'
const prompt = 'What is 17 * 23? Answer with the number only.'

for (const model of ['deepseek-v4.1-flash', 'deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp']) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, 'x-opencode-session': 'session-' + randomUUID() },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 32, stream: false }),
  })
  const body = await res.json()
  const u = body.usage ?? {}
  console.log(`${model.padEnd(30)} HTTP ${res.status}  prompt_tokens=${String(u.prompt_tokens).padStart(3)}  有cache字段=${'prompt_cache_hit_tokens' in u}  响应id前缀=${String(body.id ?? '').split('-')[0]}`)
}