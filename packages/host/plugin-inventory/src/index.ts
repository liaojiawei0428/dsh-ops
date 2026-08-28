/** Read-only projection of the current Cordis Loader plugin entries. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  PluginEntryId,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySnapshot,
} from './types.ts'

export type * from './types.ts'

/** Brand an existing Loader-tree entry id at the owning boundary. */
function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/**
 * Anchor whose parent walk hits `$DSH_HOME/profiles/node_modules`: every row
 * name any profile boots resolves there through ordinary Node resolution, so
 * the same walk locates each row's package manifest.
 */
function resolvePackageJson(specifier: string): string {
  return createRequire(join(resolveDshHome(), 'profiles', 'package.json')).resolve(specifier)
}

/**
 * Manifest specifiers to probe for one Loader module name: the exact
 * specifier's own manifest when it exposes one, then the owning package's
 * root manifest so subpath rows (for example `pkg/startup`) still report the
 * package description.
 */
function packageJsonCandidates(moduleName: string): string[] {
  const candidates = [`${moduleName}/package.json`]
  const packageName = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0]
  if (!candidates.includes(`${packageName}/package.json`)) {
    candidates.push(`${packageName}/package.json`)
  }
  return candidates
}

/**
 * Read one Loader module's package manifest description through the supplied
 * resolver, returning null whenever no usable manifest or description exists
 * (`cordis:` builtins, missing packages, manifests without text).
 * @param moduleName - Loader module name; scoped names probe the owning package root too.
 * @param resolvePackageJson - resolves one manifest specifier to a readable file path.
 * @returns the manifest description text, or null when no usable text exists.
 */
export function readModuleDescription(
  moduleName: string,
  resolvePackageJson: (specifier: string) => string,
): string | null {
  let raw: string | undefined
  for (const candidate of packageJsonCandidates(moduleName)) {
    try {
      raw = readFileSync(resolvePackageJson(candidate), 'utf8')
    } catch {
      // Either resolution failed (uninstalled or builtin name) or the probe
      // found no readable manifest; the next candidate may still match.
      continue
    }
    break
  }
  const description = JSON.parse(raw ?? '{}').description
  return typeof description === 'string' && description.trim().length > 0 ? description : null
}

/** Read an entry module's description through the installed profile tree. */
function readInstalledModuleDescription(moduleName: string): string | null {
  return readModuleDescription(moduleName, resolvePackageJson)
}

/** Remote-only service exposing the Loader's current non-group entry state. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']

  /** Entry-specifier-to-description reader; tests replace this to stay filesystem-free. */
  readDescription: (moduleName: string) => string | null = readInstalledModuleDescription

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized.
   * @returns Current non-group Loader entries in Loader order.
   */
  @Remote('list')
  list(): PluginInventorySnapshot {
    const entries: PluginInventoryEntry[] = []
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      entries.push({
        entryId: pluginEntryId(entry.id),
        moduleName: entry.options.name,
        description: this.readDescription(entry.options.name),
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      })
    }
    return { entries }
  }
}

export default PluginInventoryGateway
