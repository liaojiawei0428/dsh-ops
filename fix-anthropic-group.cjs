// 一次性脚本：按 OpenCode 官方文档（https://opencode.ai/docs/zh-cn/go/ 的 API 端点表）修正协议归属。
// 官方文档指定用 /v1/messages（anthropic）的模型有 8 个，此前因探活"completions 优先"而误置于 completions 组。
// 本脚本把其中 5 个从 opencode-go 迁到 opencode-live-anthropic，并显式补容量（目录容量与协议无关，可直接沿用）。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const MIGRATE = {
  'minimax-m2.5': { name: 'MiniMax-M2.5', contextWindow: 204800, maxTokens: 131072, input: ['text'] },
  'qwen3.8-max': { name: 'Qwen3.8 Max', contextWindow: 1000000, maxTokens: 131072, input: ['text', 'image'] },
  'qwen3.7-max': { name: 'Qwen3.7 Max', contextWindow: 1000000, maxTokens: 65536, input: ['text'] },
  'qwen3.7-plus': { name: 'Qwen3.7 Plus', contextWindow: 1000000, maxTokens: 65536, input: ['text', 'image'] },
  'qwen3.6-plus': { name: 'Qwen3.6 Plus', contextWindow: 1000000, maxTokens: 65536, input: ['text', 'image'] },
}

const src = 'C:/Users/Administrator/.dsh/settings.yaml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))

const goModels = doc.getIn(['llm-pi-ai', 'providers', 'opencode-go', 'models'])
const keep = goModels.items.filter(n => MIGRATE[n.get('id')] === undefined)
const removed = goModels.items.filter(n => MIGRATE[n.get('id')] !== undefined).map(n => n.get('id'))
if (removed.length !== 5) throw new Error('expected 5 removals, got ' + removed.length + ': ' + removed.join(','))
goModels.items = keep

const anthroModels = doc.getIn(['llm-pi-ai', 'providers', 'opencode-live-anthropic', 'models'])
const have = new Set(anthroModels.items.map(n => n.get('id')))
for (const [id, meta] of Object.entries(MIGRATE)) {
  if (have.has(id)) continue
  anthroModels.add({ id, ...meta })
}

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
for (const k of ['opencode-go', 'opencode-live-anthropic', 'opencode-live-responses']) {
  const n = doc2.getIn(['llm-pi-ai', 'providers', k])
  const ids = n.get('models').items.map(i => i.get('id'))
  console.log(`${k} (${n.get('api')}) ${ids.length} 个:`)
  console.log('   ' + ids.join(', '))
}
console.log('DONE')