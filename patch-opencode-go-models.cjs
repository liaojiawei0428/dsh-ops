// 一次性脚本：给 opencode-go 里 3 个"目录外"模型补同族 compat 与 reasoningEfforts。
// 依据：deepseek-v4-flash（目录条目）与 minimax-m2.7（目录条目）的 compat/推理定义。
// 注意 DSH 语义：目录 map 中为 null 的等级 = 不支持 → 不声明（DSH 会自动 pin 为 null）。
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
const DS_EFFORTS = { low: 'low', high: 'high', max: 'max' } // 源自 deepseek-v4-flash 的 thinkingLevelMap（非 null 项）
const MM_COMPAT = { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' }
const MM_EFFORTS = { low: 'low', medium: 'medium', high: 'high' }

const PATCH = {
  'deepseek-flash': { reasoningEfforts: DS_EFFORTS, compat: DS_COMPAT },
  'deepseek-v4.1-flash': { reasoningEfforts: DS_EFFORTS, compat: DS_COMPAT },
  'minimax-m2.5': { reasoningEfforts: MM_EFFORTS, compat: MM_COMPAT },
}

const src = 'C:/Users/Administrator/.dsh/settings.yaml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))
const models = doc.getIn(['llm-pi-ai', 'providers', 'opencode-go', 'models'])
let patched = 0
for (const node of models.items) {
  const id = node.get('id')
  const p = PATCH[id]
  if (!p) continue
  for (const [k, v] of Object.entries(p)) node.set(k, v)
  patched++
}
if (patched !== 3) throw new Error('expected 3 patches, got ' + patched)

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
const m2 = doc2.getIn(['llm-pi-ai', 'providers', 'opencode-go', 'models'])
for (const node of m2.items) {
  if (!PATCH[node.get('id')]) continue
  console.log(node.get('id'), '| reasoningEfforts=', JSON.stringify(node.get('reasoningEfforts')), '| compat=', JSON.stringify(node.get('compat')))
}
console.log('total models:', m2.items.length, '| DONE')