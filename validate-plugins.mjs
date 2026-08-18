#!/usr/bin/env node
/**
 * validate-plugins.mjs — pre-restart gate for linked DSH profile plugins.
 *
 * The 13:05 incident class: a plugin whose ctx.tools.register() call throws
 * (e.g. an output schema outside the registry's JSON Schema dialect) fails the
 * loader loudly and the server process dies before binding its port. The
 * composition dump cannot catch it — it renders the tree without executing
 * apply(). This gate executes each linked plugin's REAL registration path
 * against a mock context and validates every registered tool with the REAL
 * core validator imported from the built harness, so a broken plugin is
 * rejected here, while the old server is still running and untouched.
 *
 * Checks per plugin (dependencies with a `link:` protocol in the profile's
 * package.json):
 *   1. the module imports cleanly (syntax, missing files);
 *   2. apply() runs against a mock ctx without throwing;
 *   3. every ctx.tools.register() definition passes the core
 *      assertSupportedJsonSchema on its output schema — the exact validator
 *      production runs;
 *   4. every file the package's `exports` map declares exists on disk.
 *
 * Exit 0 = all plugins safe to load; exit 1 = at least one failure, with the
 * per-plugin reason printed and nothing mutated anywhere.
 */

import { access } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * Where the built core validator lives: derived from this script's own
 * location (DSH-ops) — the official repo is the sibling <root>/Deepseek_DSH,
 * so any drive letter works. Override via DSH_TOOLS_LIB when needed.
 */
const OPS_DIR = dirname(fileURLToPath(import.meta.url))
const TOOLS_LIB = process.env.DSH_TOOLS_LIB
  ?? join(dirname(OPS_DIR), 'Deepseek_DSH/packages/core/tools/lib/index.js').replaceAll('\\', '/')
/** Profile directory whose linked plugins to validate; resolved per machine. */
const PROFILE_DIR = process.argv[2]
  ?? (process.env.DSH_HOME !== undefined ? resolve(process.env.DSH_HOME, 'profiles/web') : resolve(homedir(), '.dsh/profiles/web'))

/** Resolve the `exports` file list of a package.json manifest.
 * @param manifest - parsed package.json.
 * @returns export-relative file paths declared by the manifest.
 */
function declaredExportFiles(manifest) {
  const files = []
  const pushEntry = (entry) => {
    if (typeof entry === 'string') files.push(entry)
    else if (typeof entry === 'object' && entry !== null) {
      for (const key of ['types', 'default']) {
        if (typeof entry[key] === 'string') files.push(entry[key])
      }
    }
  }
  const exportsField = manifest.exports
  if (typeof exportsField === 'string') {
    pushEntry(exportsField)
  } else if (typeof exportsField === 'object' && exportsField !== null) {
    for (const subpath of Object.values(exportsField)) pushEntry(subpath)
  }
  return [...new Set(files)].filter(file => !file.startsWith('./src'))
}

/** Build the mock host context that records registrations and validates tools.
 * @param assertSchema - the real assertSupportedJsonSchema from the core.
 * @returns a mock ctx plus the collected section/tool records.
 */
function mockContext(assertSchema) {
  const records = { sections: [], tools: [], routes: [], contexts: [], events: [] }
  const ctx = {
    shell: { sandboxMode: undefined, resolve: request => request, run: async () => { throw new Error('mock: not executed') } },
    get(_name) { return undefined },
    // The registration-time effect idiom (host halves wrap route/subscription
    // registrations in ctx.effect(() => disposer)); the mock invokes the body
    // once and discards the disposer — nothing real is mounted.
    effect(body) {
      const dispose = body()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    // Event subscriptions (ctx.on returns the Cordis disposer); the mock
    // records the event name and never fires.
    on(event) {
      records.events.push(event)
      return () => {}
    },
    webServer: { register: route => { records.routes.push(route.path) } },
    systemPrompt: {
      section: section => { records.sections.push(section) },
      context: provider => { records.contexts.push(provider) },
    },
    tools: {
      register: definition => {
        const output = definition.output
        if (output === undefined || typeof output !== 'object' || typeof output.render !== 'function') {
          throw new Error(`tool "${definition.name}": output { schema, render } is required`)
        }
        try {
          assertSchema(output.schema)
        } catch (error) {
          throw new Error(`tool "${definition.name}": ${error.message}`)
        }
        records.tools.push(definition.name)
      },
    },
  }
  return { ctx, records }
}

/**
 * Syntax-check a browser-half client file with `node --check` (parse without
 * execute — the browser module loader globals do not exist here). The check
 * honors the package's `"type": "module"`.
 * @param file - absolute path of the client entry.
 * @returns undefined when the file parses, else the failure detail.
 */
function checkClientSyntax(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status === 0) return undefined
  const detail = (result.stderr ?? '').split('\n').filter(line => line.length > 0).slice(0, 3).join(' | ')
  return detail.length > 0 ? detail : `node --check exited ${result.status}`
}

// ---- Main ------------------------------------------------------------------

let assertSupportedJsonSchema
try {
  ;({ assertSupportedJsonSchema } = await import(pathToFileURL(TOOLS_LIB).href))
} catch (error) {
  console.error(`validate-plugins: cannot load core validator from ${TOOLS_LIB}`)
  console.error(`  (run "pnpm run build" in the DSH repo first, or set DSH_TOOLS_LIB)`)
  console.error(`  ${error.code ?? error.message}`)
  process.exit(1)
}
const profilePath = resolve(PROFILE_DIR)
const manifestPath = join(profilePath, 'package.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const links = Object.entries(manifest.dependencies ?? {})
  .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('link:'))
  .map(([name, spec]) => ({ name, dir: spec.slice('link:'.length) }))

if (links.length === 0) {
  console.log('validate-plugins: no linked plugins declared; nothing to check')
  process.exit(0)
}

let failed = 0
for (const link of links) {
  const pluginManifestPath = join(link.dir, 'package.json')
  let pluginManifest
  try {
    pluginManifest = JSON.parse(await readFile(pluginManifestPath, 'utf8'))
  } catch (error) {
    failed += 1
    console.error(`FAIL ${link.name}: cannot read ${pluginManifestPath}: ${error.message}`)
    continue
  }

  // Declared export files must exist (a stale link or missing build output
  // otherwise surfaces only at server load).
  let missingFiles = []
  for (const file of declaredExportFiles(pluginManifest)) {
    try {
      await access(join(link.dir, file))
    } catch {
      missingFiles.push(file)
    }
  }
  if (missingFiles.length > 0) {
    failed += 1
    console.error(`FAIL ${link.name}: declared exports missing on disk: ${missingFiles.join(', ')}`)
    continue
  }

  const entry = pluginManifest.main ?? 'index.js'
  const entryUrl = pathToFileURL(join(link.dir, entry)).href
  try {
    const module = await import(entryUrl)
    if (typeof module.apply !== 'function') {
      throw new Error('module does not export an apply() function')
    }
    const { ctx, records } = mockContext(assertSupportedJsonSchema)
    try {
      module.apply(ctx, {})
    } catch (error) {
      throw new Error(`apply() threw during registration: ${error.message}`)
    }
    // Browser half: a plugin that exports './client' ships a client entry the
    // browser module loader executes at page load; a syntax error there breaks
    // the page, so parse-check it with the same Node that runs the server.
    const clientEntry = pluginManifest.exports?.['./client']
    const clientFile = typeof clientEntry === 'string' ? clientEntry : clientEntry?.default
    if (typeof clientFile === 'string') {
      const clientFailure = checkClientSyntax(join(link.dir, clientFile))
      if (clientFailure !== undefined) {
        throw new Error(`client entry ${clientFile} fails to parse: ${clientFailure}`)
      }
    }
    const tools = records.tools.length > 0 ? records.tools.join(', ') : '(no tools)'
    console.log(`PASS ${link.name}: loads, apply() registers [${tools}], schemas valid`)
  } catch (error) {
    failed += 1
    console.error(`FAIL ${link.name}: ${error.message}`)
  }
}

if (failed > 0) {
  console.error(`validate-plugins: ${failed} plugin(s) would break server load — restart aborted, old server untouched`)
  process.exit(1)
}
console.log(`validate-plugins: all ${links.length} linked plugin(s) safe to load`)
// Explicit exit: imported plugin modules may leave active handles (timers,
// listeners) in the event loop, and waiting for it to drain would hang the
// gate — and with it every restart script that invokes it.
process.exit(0)
