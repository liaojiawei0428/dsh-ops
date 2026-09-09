/**
 * reapply-cli.mjs — 按个人层清单重建 web profile 的命令行入口
 *
 * bootstrap-personal.ps1 / 手动部署时调用；等价于模型工具 personal_hub_reapply，
 * 但无需 cordis 运行时：
 *   node reapply-cli.mjs [manifestPath]
 *
 * manifestPath 缺省 = <DSH-ops>/personal-hub/personal.json（合并本机覆盖层
 * personal.local.json 后作为清单）。
 */

import { reapply } from './plugins/dsh-personal-hub/index.js'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const defaultManifest = join(here, 'personal-hub', 'personal.json')
const manifestPath = process.argv[2] ?? defaultManifest

const result = await reapply(manifestPath)
console.log(JSON.stringify(result, null, 1))
process.exit(result.ok ? 0 : 1)