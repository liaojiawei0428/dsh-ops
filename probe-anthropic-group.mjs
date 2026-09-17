// 一次性探活：按官方文档指定协议实测 anthropic 组 8 个模型（POST /v1/messages）
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}

const ids = ['minimax-m3', 'minimax-m2.7', 'qwen3.8-flash', 'minimax-m2.5', 'qwen3.8-max', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-plus']
const url = 'https://opencode.ai/zen/go/v1/messages'

for (const id of ids) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'x-opencode-session': 'session-' + randomUUID(),
    },
    body: JSON.stringify({ model: id, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
  })
  const text = await res.text()
  const brief = res.ok ? 'OK' : text.replace(/\s+/g, ' ').slice(0, 130)
  console.log(`${id.padEnd(16)} HTTP ${res.status}  ${brief}`)
}