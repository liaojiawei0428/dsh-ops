// 一次性脚本：把端点 /models 列出的全部 37 个模型配齐（含当前不可用者，按用户要求"列表要全"）。
// 新增 10 个此前未配置的模型：6 个 completions（协议按同族推断）+ 4 个 responses（官方端点表/同族）。
// 元数据来源：pi-ai 目录（同族克隆）与官方文档定价表；grok-4.5/qwen3.5-plus 等同族推断。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const GLM_COMPAT = { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' }
const KIMI_COMPAT = { supportsStore: false, supportsDeveloperRole: false, thinkingFormat: 'deepseek', supportsReasoningEffort: false, maxTokensField: 'max_tokens', supportsLongCacheRetention: false }
const QWEN_COMPAT = { supportsStore: false, supportsDeveloperRole: false, thinkingFormat: 'qwen', maxTokensField: 'max_tokens' }
const MM_COMPAT = { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' }

// 加入 opencode-go（openai-completions）——当前实测不可用 6 个，仅为让列表完整
const ADD_COMPLETIONS = [
  { id: 'glm-5', name: 'GLM-5', contextWindow: 202752, maxTokens: 32768, input: ['text'], compat: GLM_COMPAT },
  { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 262144, maxTokens: 65536, input: ['text', 'image'], compat: KIMI_COMPAT },
  { id: 'mimo-v2-pro', name: 'MiMo V2 Pro', contextWindow: 1048576, maxTokens: 128000, input: ['text'], compat: MM_COMPAT },
  { id: 'mimo-v2-omni', name: 'MiMo V2 Omni', contextWindow: 1000000, maxTokens: 128000, input: ['text', 'image'], compat: MM_COMPAT },
  { id: 'hy3-preview', name: 'Hy3 preview', contextWindow: 256000, maxTokens: 128000, input: ['text'], compat: MM_COMPAT },
  { id: 'qwen3.5-plus', name: 'Qwen3.5 Plus', contextWindow: 1000000, maxTokens: 65536, input: ['text', 'image'], compat: QWEN_COMPAT },
]

// 加入 opencode-live-responses（openai-responses）
const ADD_RESPONSES = [
  { id: 'grok-4.5', name: 'Grok 4.5', contextWindow: 500000, maxTokens: 500000, input: ['text', 'image'] },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 1050000, maxTokens: 128000, input: ['text', 'image'] },
  { id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor', contextWindow: 1048576, maxTokens: 131072, input: ['text', 'image'] },
  { id: 'muse-spark-1.2-contributor', name: 'Muse Spark 1.2 Contributor', contextWindow: 1048576, maxTokens: 131072, input: ['text', 'image'] },
]

const src = 'C:/Users/Administrator/.dsh/settings.yaml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))

function appendAll(routeKey, entries) {
  const models = doc.getIn(['llm-pi-ai', 'providers', routeKey, 'models'])
  const have = new Set(models.items.map(n => n.get('id')))
  for (const e of entries) if (!have.has(e.id)) models.add(e)
  return models.items.length
}

const goCount = appendAll('opencode-go', ADD_COMPLETIONS)
const respCount = appendAll('opencode-live-responses', ADD_RESPONSES)

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
let total = 0
for (const k of ['opencode-go', 'opencode-live', 'opencode-live-anthropic', 'opencode-live-responses']) {
  const ids = doc2.getIn(['llm-pi-ai', 'providers', k, 'models']).items.map(i => i.get('id'))
  if (k !== 'opencode-live') total += ids.length
  console.log(`${k.padEnd(24)} ${String(ids.length).padStart(2)} 个`)
}
console.log('端点全部模型合计（不含发现入口 opencode-live 的重复）:', total)
console.log('DONE')