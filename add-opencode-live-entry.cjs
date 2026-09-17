// 一次性脚本：新建 opencode-live 路由——"实时发现入口"，
// 承载 pi-ai 目录快照未收录 / 官方文档未列的 completions 模型。
// 作用：该路由名不命中 pi-ai 目录，故其"获取模型"按钮会走网络，返回端点实时列表（37 个）。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const DS_COMPAT = {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: 'max_tokens',
  requiresReasoningContentOnAssistantMessages: true,
  thinkingFormat: 'deepseek',
}
const DS_EFFORTS = { low: 'low', high: 'high', max: 'max' }

const route = {
  displayName: 'OpenCode Live',
  apiKeyEnv: 'OPENCODE_GO_API_KEY',
  api: 'openai-completions',
  baseURL: 'https://opencode.ai/zen/go/v1',
  defaultContextWindow: 262144,
  defaultMaxTokens: 32768,
  models: [
    {
      id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash',
      contextWindow: 1000000, maxTokens: 384000, input: ['text'],
      reasoningEfforts: DS_EFFORTS, compat: DS_COMPAT,
    },
    {
      id: 'deepseek-flash', name: 'DeepSeek Flash',
      contextWindow: 1000000, maxTokens: 384000, input: ['text'],
      reasoningEfforts: DS_EFFORTS, compat: DS_COMPAT,
    },
    {
      id: 'omen-alpha', name: 'Omen Alpha',
      contextWindow: 500000, maxTokens: 128000, input: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high' },
      compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
    },
  ],
}

const src = 'C:/Users/Administrator/.dsh/settings.yaml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))
const prov = doc.getIn(['llm-pi-ai', 'providers'])
if (prov.has('opencode-live')) prov.delete('opencode-live')
prov.set('opencode-live', route)

// 该路由必须排在其他 opencode 路由之前或之后不影响功能；保持插入位置即可
const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
const n = doc2.getIn(['llm-pi-ai', 'providers', 'opencode-live'])
console.log('opencode-live:', n.get('api'), '|', n.get('baseURL'), '| models:', n.get('models').items.map(i => i.get('id')).join(', '))
console.log('providers:', doc2.getIn(['llm-pi-ai', 'providers']).items.map(p => p.key.value).join(', '))
console.log('DONE')