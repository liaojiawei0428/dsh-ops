// 一次性取证：用同一个真实端点与同一把 key，对比"目录名"与"非目录名"的 discovery 结果
import { readFileSync } from 'node:fs'
import { discoverModels } from './lib/types/discovery.js'

const creds = readFileSync('C:/Users/Administrator/.dsh/.credentials.yaml', 'utf8')
let key
for (const line of creds.split(/\r?\n/)) {
  const m = /^\s*OPENCODE_GO_API_KEY:\s*(\S+)/.exec(line)
  if (m) key = m[1]
}

const endpoint = 'https://opencode.ai/zen/go/v1'
for (const provider of ['opencode-go', 'opencode', 'opencode-live', 'my-own-gateway']) {
  try {
    const models = await discoverModels({ provider, baseURL: endpoint, api: 'openai-completions', apiKey: key })
    const ids = models.map(m => m.id)
    console.log(`${provider.padEnd(16)} -> ${String(ids.length).padStart(2)} 个 | 含 deepseek-v4.1-flash: ${ids.includes('deepseek-v4.1-flash')}`)
  } catch (e) {
    console.log(`${provider.padEnd(16)} -> 报错: ${e.message}`)
  }
}