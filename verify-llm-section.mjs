// 常备校验：resolveProfiles 解析整个 llm-pi-ai 段（deferred=存储读，strict=写路径）
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolveProfiles } from 'file:///E:/DSH/Deepseek_DSH/packages/llm/llm-pi-ai/lib/types/config.js'

const require = createRequire(import.meta.url)
const yaml = require('E:/DSH/Deepseek_DSH/node_modules/js-yaml')
const settings = yaml.load(readFileSync('C:/Users/Administrator/.dsh/settings.yaml', 'utf8'))
const providers = settings['llm-pi-ai'].providers

let bad = 0
for (const validation of ['deferred', 'strict']) {
  const lines = []
  try {
    const profiles = resolveProfiles(providers, validation)
    for (const [name, p] of profiles) {
      const models = p.piProvider ? p.piProvider.getModels() : []
      const err = p.catalogError ?? 'none'
      if (err !== 'none' || p.modelErrors.size > 0) bad++
      lines.push(`  ${name.padEnd(26)} models=${String(models.length).padStart(2)}  catalogError=${err}  modelErrors=${p.modelErrors.size}`)
    }
    console.log(`=== ${validation} (${profiles.size} providers) ===`)
    console.log(lines.join('\n'))
  } catch (e) {
    bad++
    console.log(`=== ${validation} === 抛出异常: ${e.message}`)
  }
}
console.log(bad === 0 ? '\nALL CLEAN' : `\nPROBLEMS: ${bad}`)
process.exitCode = bad === 0 ? 0 : 1