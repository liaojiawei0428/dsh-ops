// 一次性修复脚本：给 settings.yaml 的 opencode-go 路由补 api 与 deepseek-v4.1-flash 模型。
// round-trip 修改，保留其余原样；临时文件 + rename 原子写回；写后回读校验。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')
const src = 'C:/Users/Administrator/.dsh/settings.yaml'

const text = fs.readFileSync(src, 'utf8')
const doc = YAML.parseDocument(text)
if (doc.errors.length > 0) throw new Error('parse errors: ' + doc.errors.map(e => e.message).join('; '))

const og = doc.getIn(['llm-pi-ai', 'providers', 'opencode-go'])
if (!og || typeof og !== 'object') throw new Error('opencode-go provider not found')

if (og.get('api') === undefined) og.set('api', 'openai-completions')

const models = og.get('models')
if (!models || typeof models !== 'object') throw new Error('opencode-go.models not found')
const ids = models.items.map(i => i.get('id'))
if (!ids.includes('deepseek-v4.1-flash')) {
  models.add({ id: 'deepseek-v4.1-flash', name: 'deepseek-v4.1-flash' })
}

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, doc.toString(), 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite parse errors: ' + doc2.errors.map(e => e.message).join('; '))
console.log('verified api =', doc2.getIn(['llm-pi-ai', 'providers', 'opencode-go', 'api']))
console.log('verified models =', JSON.stringify(doc2.getIn(['llm-pi-ai', 'providers', 'opencode-go', 'models']).items.map(i => i.get('id'))))
console.log('DONE')