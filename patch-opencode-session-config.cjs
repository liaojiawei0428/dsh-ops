// 一次性脚本：给 cordis.patch.yml 的 opencode-session-id 条目加 config.providers = []
// 语义（插件代码确认）：providers 非空时是白名单；空数组 = 不按 provider 名限制，仅按 host(opencode.ai) 匹配。
// 这样任何自定义命名的 opencode 路由（opencode-live 等）也会带上 x-opencode-session 头。
'use strict'
const fs = require('fs')
const YAML = require('E:/DSH/Deepseek_DSH/packages/settings/settings-file/node_modules/yaml')

const src = 'C:/Users/Administrator/.dsh/profiles/web/cordis.patch.yml'
const doc = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc.errors.length > 0) throw new Error('parse: ' + doc.errors.map(e => e.message).join('; '))

const seq = doc.contents
if (!seq || !Array.isArray(seq.items)) throw new Error('expected a top-level sequence')
let hit = 0
for (const node of seq.items) {
  if (node.get('id') !== 'opencode-session-id') continue
  node.set('config', { providers: [] })
  hit++
}
if (hit !== 1) throw new Error('expected exactly one opencode-session-id entry, found ' + hit)

// 同步更新该条目上方的注释，说明这次为何显式声明空数组
const text = doc.toString()
const updated = text.replace(
  "# opencode-session-id: inject per-conversation x-opencode-session header into opencode.ai gateway requests (required since 2026-09-05, HTTP 400 MissingSessionID otherwise).",
  "# opencode-session-id: inject per-conversation x-opencode-session header into opencode.ai gateway requests (required since 2026-09-05, HTTP 400 MissingSessionID otherwise).\n# providers: [] disables the provider-name allowlist, so ANY route pointing at opencode.ai gets the header (custom-named routes such as opencode-live would otherwise 400 MissingSessionID).")

const tmp = src + '.tmp-' + Date.now()
fs.writeFileSync(tmp, updated, 'utf8')
fs.renameSync(tmp, src)

const doc2 = YAML.parseDocument(fs.readFileSync(src, 'utf8'))
if (doc2.errors.length > 0) throw new Error('rewrite: ' + doc2.errors.map(e => e.message).join('; '))
for (const node of doc2.contents.items) {
  const cfg = node.get('config')
  console.log(`${node.get('id')}`, cfg ? `config=${JSON.stringify(cfg)}` : '(no config)')
}
console.log('DONE')