#!/usr/bin/env node
/**
 * test-standard.mjs — acceptance test for the DSH plugin standard toolchain.
 *
 * Runs the full standard's happy path AND its failure paths against throwaway
 * directories, never touching the real profile or the running server:
 *
 *   T1  new-plugin scaffold passes the pre-flight gate as-is
 *   T2  an output schema with property-level `required` (the 13:05 incident
 *       shape) is rejected by the gate with the dialect violation named
 *   T3  a browser-half client entry with a syntax error is rejected
 *   T4  disable-plugin removes a plugin from the bundle list without touching
 *       files or links, and reports the recovery step
 *
 * Exit 0 = the standard's guarantees hold; exit 1 = at least one regressed.
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const OPS = resolve('D:/GongJu/DSH-ops')
const NODE = process.execPath

/** Run one helper script and capture { status, stdout, stderr }. */
function run(script, args) {
  const result = spawnSync(NODE, [join(OPS, script), ...args], { encoding: 'utf8' })
  return { status: result.status, out: (result.stdout ?? '') + (result.stderr ?? '') }
}

/** Write a profile manifest whose dependencies link the given plugin dirs. */
async function writeProfile(dir, entries) {
  await mkdir(dir, { recursive: true })
  const manifest = {
    name: 'dsh-profile-test',
    private: true,
    dependencies: Object.fromEntries(entries.map(({ name, dir: pluginDir }) => [name, `link:${pluginDir.replace(/\\/g, '/')}`])),
    dsh: { profile: { bundles: entries.map(entry => entry.name) } },
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

const root = await mkdtemp(join(tmpdir(), 'dsh-standard-test-'))
const pluginRoot = join(root, 'plugins')
const results = []
const check = (id, label, ok, detail = '') => {
  results.push({ id, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}: ${label}${detail.length > 0 ? `\n      ${detail.replace(/\n/g, '\n      ')}` : ''}`)
}

try {
  // T1 — scaffold passes the gate.
  const scaffoldName = 'dsh-test-scaffold'
  const scaffold = run('new-plugin.mjs', [scaffoldName, '--dir', pluginRoot])
  const profileA = join(root, 'profile-a')
  await writeProfile(profileA, [{ name: scaffoldName, dir: join(pluginRoot, scaffoldName) }])
  const gateA = run('validate-plugins.mjs', [profileA])
  check('T1', 'scaffold passes pre-flight gate', gateA.status === 0 && gateA.out.includes('PASS'), gateA.out.trim())

  // T2 — the 13:05 schema shape is rejected with the violation named.
  const badSchemaName = 'dsh-test-bad-schema'
  const badSchemaDir = join(pluginRoot, badSchemaName)
  await mkdir(badSchemaDir, { recursive: true })
  await writeFile(join(badSchemaDir, 'package.json'), JSON.stringify({
    name: badSchemaName, version: '0.1.0', private: true, type: 'module', main: 'index.js',
    exports: { '.': './index.js', './cordis.patch.yml': './cordis.patch.yml' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n', 'utf8')
  await writeFile(join(badSchemaDir, 'index.js'), `export const name = 'test-bad-schema'\nexport const inject = ['tools']\nexport function apply(ctx) {\n  ctx.effect(() => ctx.tools.register({\n    name: 'badtool',\n    description: 'broken on purpose',\n    parameters: { type: 'object' },\n    output: {\n      schema: { type: 'object', additionalProperties: false, required: true, properties: { kind: { type: 'string', required: true } } },\n      render: () => [],\n    },\n    async execute() { return { kind: 'x' } },\n  }))\n}\n`, 'utf8')
  await writeFile(join(badSchemaDir, 'cordis.patch.yml'), '- insert:\n    - id: test-bad-schema\n      name: ' + badSchemaName + '\n', 'utf8')
  const profileB = join(root, 'profile-b')
  await writeProfile(profileB, [{ name: badSchemaName, dir: badSchemaDir }])
  const gateB = run('validate-plugins.mjs', [profileB])
  check('T2', 'property-level required is rejected with the violation named',
    gateB.status === 1 && gateB.out.includes('not supported on type "string"') && gateB.out.includes('must be an array of strings'),
    gateB.out.trim())

  // T3 — a syntactically broken client entry is rejected.
  const badClientName = 'dsh-test-bad-client'
  const badClientDir = join(pluginRoot, badClientName)
  await mkdir(badClientDir, { recursive: true })
  await writeFile(join(badClientDir, 'package.json'), JSON.stringify({
    name: badClientName, version: '0.1.0', private: true, type: 'module', main: 'index.js',
    exports: { '.': './index.js', './client': './client.js', './cordis.patch.yml': './cordis.patch.yml' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: [] } },
  }, null, 2) + '\n', 'utf8')
  await writeFile(join(badClientDir, 'index.js'), `export const name = 'test-bad-client'\nexport const inject = []\nexport function apply() {}\n`, 'utf8')
  await writeFile(join(badClientDir, 'client.js'), 'window.__ModuleLoader__.load({\n  id: "broken",\n  factory: (require) => { this is not valid javascript (((\n})\n', 'utf8')
  await writeFile(join(badClientDir, 'cordis.patch.yml'), '- insert:\n    - id: test-bad-client\n      name: ' + badClientName + '\n', 'utf8')
  const profileC = join(root, 'profile-c')
  await writeProfile(profileC, [{ name: badClientName, dir: badClientDir }])
  const gateC = run('validate-plugins.mjs', [profileC])
  check('T3', 'broken client entry is rejected at parse', gateC.status === 1 && gateC.out.includes('client entry'), gateC.out.trim())

  // T4 — disable-plugin removes the bundle entry, keeps files, reports recovery.
  const disable = run('disable-plugin.mjs', [scaffoldName, '--profile', profileA])
  let after = {}
  try {
    after = JSON.parse(await readFile(join(profileA, 'package.json'), 'utf8'))
  } catch { /* handled by the check below */ }
  check('T4', 'disable removes the bundle entry and reports recovery',
    disable.status === 0
      && Array.isArray(after.dsh?.profile?.bundles) && !after.dsh.profile.bundles.includes(scaffoldName)
      && after.dependencies?.[scaffoldName]?.startsWith('link:')
      && disable.out.includes('recover'),
    (disable.out + '\n' + JSON.stringify(after.dsh?.profile?.bundles)).trim())
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {})
}

const failed = results.filter(result => !result.ok)
if (failed.length > 0) {
  console.error(`\ntest-standard: ${failed.length} check(s) FAILED — the standard's guarantees have regressed`)
  process.exit(1)
}
console.log(`\ntest-standard: all ${results.length} checks hold`)
