// 一次性脚本（修正版架构）：
//   opencode-go（pi-ai 目录路由，api=openai-completions）承载 23 个 completions 可用模型
//     —— 其中 20 个目录内模型零配置即继承目录容量/推理/兼容；3 个目录外模型显式补容量。
//   opencode-live-anthropic / opencode-live-responses 承载目录内协议冲突的 3+1 个模型（显式元数据）。
//   删除上一版 opencode-live（其模型已并入 opencode-go）。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const probe = JSON.parse(fs.readFileSync('E:/DSH/DSH-ops/.opencode-probe-full.json', 'utf8'))
const snap = JSON.parse(fs.readFileSync(
  'E:/DSH/Deepseek_DSH/packages/llm/llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/data/opencode-go.json', 'utf8'))

const meta = {} // id -> { name, api, contextWindow, maxTokens, input }
for (const [api, models] of Object.entries(snap)) {
  for (const [id, m] of Object.entries(models)) {
    meta[id] = { name: m.name, api, contextWindow: m.contextWindow, maxTokens: m.maxTokens, input: m.input }
  }
}

// 目录外模型：同族克隆 + 显式容量（与 opencode-go 目录路由的路由级默认解耦）
const EXTRA = {
  'deepseek-flash': { name: 'DeepSeek Flash', contextWindow: 1000000, maxTokens: 384000, input: ['text'] },
  'deepseek-v4.1-flash': { name: 'DeepSeek V4.1 Flash', contextWindow: 1000000, maxTokens: 384000, input: ['text'] },
  'minimax-m2.5': { name: 'MiniMax-M2.5', contextWindow: 204800, maxTokens: 131072, input: ['text'] },
}

const order = Object.keys(probe) // 端点顺序
const comp = [], anthro = [], resp = []
for (const id of order) {
  const v = probe[id]
  if (!v.ok) continue
  const m = meta[id]
  const entry = { id }
  if (m) { if (m.name) entry.name = m.name } else { Object.assign(entry, EXTRA[id]) }
  if (v.api === 'openai-completions') comp.push(m ? { id, name: m.name } : entry)
  else if (v.api === 'anthropic-messages') anthro.push({ id, name: m?.name ?? EXTRA[id]?.name ?? id, ...(m ? { contextWindow: m.contextWindow, maxTokens: m.maxTokens, input: m.input } : {}) })
  else resp.push({ id, name: m?.name ?? id, ...(m ? { contextWindow: m.contextWindow, maxTokens: m.maxTokens, input: m.input } : {}) })
}

const src = 'C:/Users/Administrator/.dsh/settings.yaml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))
const prov = doc.getIn(['llm-pi-ai', 'providers'])

// 1) opencode-go 扩充为 completions 组（保留路由级 api 与已有 apiKeyEnv/baseURL）
const og = prov.get('opencode-go')
og.set('models', comp)
console.log('opencode-go  :', comp.length, '个 completions 模型')

// 2) anthropic 组
if (prov.has('opencode-live-anthropic')) prov.delete('opencode-live-anthropic')
prov.set('opencode-live-anthropic', {
  displayName: 'OpenCode Live (Anthropic)',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  api: 'anthropic-messages',
  baseURL: 'https://opencode.ai/zen/go',
  models: anthro,
})

// 3) responses 组
if (prov.has('opencode-live-responses')) prov.delete('opencode-live-responses')
prov.set('opencode-live-responses', {
  displayName: 'OpenCode Live (Responses)',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  api: 'openai-responses',
  baseURL: 'https://opencode.ai/zen/go/v1',
  models: resp,
})

// 4) 删除上一版 opencode-live
if (prov.has('opencode-live')) prov.delete('opencode-live')

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
for (const k of ['opencode-go', 'opencode-live-anthropic', 'opencode-live-responses']) {
  const n = doc2.getIn(['llm-pi-ai', 'providers', k])
  console.log(`${k.padEnd(24)} api=${n.get('api')}  models=${n.get('models').items.length}`)
}
console.log('providers:', doc2.getIn(['llm-pi-ai', 'providers']).items.map(p => p.key.value).join(', '))
console.log('DONE')