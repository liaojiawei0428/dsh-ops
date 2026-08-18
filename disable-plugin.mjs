#!/usr/bin/env node
/**
 * disable-plugin.mjs — emergency removal path for a broken linked plugin.
 *
 * The standard's last resort (PLUGIN-STANDARD.md R4): when a linked plugin is
 * broken and blocks normal operation, remove it from the profile's bundle list
 * WITHOUT touching its files or link, so the server boots clean immediately
 * and the plugin returns by re-adding one line after it is fixed.
 *
 * Only the `dsh.profile.bundles` entry is removed — the `dependencies` link
 * stays, so `pnpm install` state is untouched and recovery is one edit away.
 *
 * Usage:  node disable-plugin.mjs <name> [--profile C:/Users/<u>/.dsh/profiles/web]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const argName = process.argv[2]
if (argName === undefined) {
  console.error('usage: node disable-plugin.mjs <name>')
  process.exit(1)
}
const profIdx = process.argv.indexOf('--profile')
const profileDir = profIdx !== -1
  ? resolve(process.argv[profIdx + 1])
  : resolve(process.env.DSH_HOME ?? resolve(homedir(), '.dsh'), 'profiles/web')
const manifestPath = resolve(profileDir, 'package.json')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const bundles = manifest.dsh?.profile?.bundles
if (!Array.isArray(bundles)) {
  console.error(`no dsh.profile.bundles array found in ${manifestPath}`)
  process.exit(1)
}
if (!bundles.includes(argName)) {
  console.error(`"${argName}" is not in the bundle list — nothing to disable`)
  process.exit(1)
}
if (!(manifest.dependencies?.[argName] ?? '').startsWith('link:')) {
  console.error(`refusing: "${argName}" is not a link: dependency; hand-edit the profile instead`)
  process.exit(1)
}

manifest.dsh.profile.bundles = bundles.filter(item => item !== argName)
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

console.log(`disabled: "${argName}" removed from dsh.profile.bundles (files and link untouched)`)
console.log(`restart the server now — the plugin no longer loads`)
console.log(``)
console.log(`recover after fixing:`)
console.log(`  re-add "${argName}" to dsh.profile.bundles in ${manifestPath}`)
console.log(`  then restart; the pre-flight gate will re-validate it`)
