#!/usr/bin/env node
/**
 * check-plugin-copy.mjs — plugin display-copy completeness check.
 *
 * The plugin manager's card titles come from the official `packageText()`; on
 * this deployment a patched version of it consults `globalThis.__DSH_PLUGIN_COPY__`,
 * a table published by `plugins/dsh-plugin-guide/client.js` (BUNDLE_COPY). A new
 * plugin that nobody adds to that table silently falls back to the English short
 * name (`shortName(package)`) — no error, no log, just a wrong-looking card. This
 * gate closes exactly that hole.
 *
 * Every bundle in the profile's `dsh.profile.bundles` must satisfy one of:
 *   1. it has an entry in BUNDLE_COPY (Chinese name + one-line description);
 *   2. it is in the official BUILTIN_COPY — the shipped map outranks the personal
 *      table, so such a package needs no entry here;
 *   3. it is listed in EXEMPT below with a written reason.
 *
 * Bundles the installation merely offers (absent from `dsh.profile.bundles`,
 * e.g. the disabled acp-app/headless/sdk-* profiles) are reported as
 * informational only: the manager lists them, but they are not part of this
 * deployment's composition.
 *
 * Exit 0 = no gap; exit 1 = at least one composition bundle lacks Chinese copy,
 * each printed with the file to edit. Nothing is ever mutated.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OPS_DIR = dirname(fileURLToPath(import.meta.url))

/** Profile whose bundle list defines the requirement; override via DSH_PROFILE_DIR. */
const PROFILE_DIR = process.env.DSH_PROFILE_DIR
  ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'web')

const GUIDE_CLIENT = join(OPS_DIR, 'plugins/dsh-plugin-guide/client.js')

/**
 * Packages that need no BUNDLE_COPY entry, with the reason. The first three are
 * the official `BUILTIN_COPY` map (packages/client/ui-plugin-manager/src/client/
 * locales.ts) — shipped localized copy the patch deliberately lets win.
 * @type {ReadonlyMap<string, string>}
 */
const EXEMPT = new Map([
  ['@deepseek-ai/dsh-experimental-agent-team-profile', 'official BUILTIN_COPY — 智能体团队'],
  ['@deepseek-ai/dsh-experimental-agent-team-web-profile', 'official BUILTIN_COPY — 智能体团队 Web 界面'],
  ['@deepseek-ai/dsh-experimental-auto-review', 'official BUILTIN_COPY — 自动授权审查'],
])

/** Read the profile's declared bundle list. */
async function readProfileBundles() {
  const manifest = join(PROFILE_DIR, 'package.json')
  if (!existsSync(manifest)) throw new Error(`profile manifest not found: ${manifest}`)
  const parsed = JSON.parse(await readFile(manifest, 'utf8'))
  const bundles = parsed?.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) throw new Error(`no dsh.profile.bundles array in ${manifest}`)
  return bundles
}

/**
 * Read the keys of BUNDLE_COPY out of the hand-written client bundle. The file
 * is a module-loader wrapper this script cannot import (it calls
 * `window.__ModuleLoader__.load`), so the table is read textually: the literal
 * object spans from its declaration to the next line holding only a closing
 * brace at its own indentation.
 */
async function readCopyTable() {
  const source = await readFile(GUIDE_CLIENT, 'utf8')
  const start = source.indexOf('const BUNDLE_COPY')
  if (start === -1) throw new Error(`BUNDLE_COPY not found in ${GUIDE_CLIENT}`)
  const end = source.indexOf('\n    }', start)
  if (end === -1) throw new Error(`BUNDLE_COPY block is not terminated in ${GUIDE_CLIENT}`)
  const block = source.slice(start, end)
  const keys = new Set()
  for (const match of block.matchAll(/'([^']+)':\s*\[\s*'/g)) keys.add(match[1])
  // A malformed block would otherwise read as "every package is missing".
  if (keys.size === 0) throw new Error(`BUNDLE_COPY in ${GUIDE_CLIENT} parsed to zero entries`)
  return keys
}

const bundles = await readProfileBundles()
const table = await readCopyTable()

const missing = []
const exempted = []
const covered = []
for (const name of bundles) {
  if (table.has(name)) covered.push(name)
  else if (EXEMPT.has(name)) exempted.push(`${name} — ${EXEMPT.get(name)}`)
  else missing.push(name)
}

console.log(`check-plugin-copy: profile ${PROFILE_DIR}`)
console.log(`  profile bundles: ${bundles.length}  ·  table entries: ${table.size}`)
console.log(`  covered ${covered.length}  ·  exempt ${exempted.length}  ·  missing ${missing.length}`)
for (const line of exempted) console.log(`  exempt: ${line}`)
for (const name of table) {
  if (!bundles.includes(name)) {
    // Informational: the table may legitimately cover an installation-provided
    // bundle this profile has not selected.
    console.log(`  note: table covers ${name}, which this profile does not select`)
  }
}

if (missing.length > 0) {
  console.log('')
  console.log(`缺少中文名 ${missing.length} 项 —— 请加进 ${GUIDE_CLIENT} 的 BUNDLE_COPY，`)
  console.log('并同步 plugin-display-names.md 的台账行：')
  for (const name of missing) console.log(`  ✗ ${name}`)
  process.exit(1)
}

console.log('check-plugin-copy: 全部 bundle 均有中文名 OK')
