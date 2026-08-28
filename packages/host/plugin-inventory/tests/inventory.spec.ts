import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginInventoryGateway, {
  readModuleDescription,
} from '../src/index.ts'
import type { PluginInventoryEntry } from '../src/types.ts'

const contexts: Context[] = []
const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const activePlugin: Plugin.Function = () => {}
const pendingPlugin: Plugin.Object = {
  inject: ['neverReady'],
  apply() {},
}
const firstPlugin: Plugin.Function = () => {}
const secondPlugin: Plugin.Function = () => {}

async function harness(): Promise<{
  ctx: Context
  inventory: PluginInventoryGateway
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.active = activePlugin
  ctx.loader.builtins.pending = pendingPlugin
  ctx.loader.builtins.first = firstPlugin
  ctx.loader.builtins.second = secondPlugin
  await ctx.plugin(PluginInventoryGateway)
  const inventory = ctx.get('pluginInventory') as PluginInventoryGateway
  return { ctx, inventory }
}

/** Resolver fixture: serves canned manifests from temp files, throws canned errors. */
function manifestResolver(manifests: Record<string, object>): (specifier: string) => string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-inventory-'))
  tempRoots.push(root)
  const files = new Map(Object.entries(manifests).map(([specifier, manifest], index) => {
    const file = join(root, `manifest-${index}.json`)
    writeFileSync(file, JSON.stringify(manifest))
    return [specifier, file]
  }))
  return (specifier: string): string => {
    const file = files.get(specifier)
    if (file === undefined) throw new Error(`no manifest fixture for ${specifier}`)
    return file
  }
}

/** Resolver fixture that fails exactly like Node resolution for every probe. */
const unresolved: (specifier: string) => string = (specifier) => {
  throw new Error(`cannot resolve ${specifier}`)
}

describe('readModuleDescription', () => {
  it('reads the exact-specifier manifest before falling through to the package root', () => {
    const reader = manifestResolver({
      '@scope/tool/startup/package.json': { description: 'Subpath manifest wins.' },
      '@scope/tool/package.json': { description: 'Root fallback.' },
    })
    expect(readModuleDescription('@scope/tool/startup', reader)).toBe('Subpath manifest wins.')
  })

  it('falls back to the owning package manifest for subpath rows without their own export', () => {
    const reader = manifestResolver({
      '@scope/tool/package.json': { description: 'Root fallback.' },
    })
    expect(readModuleDescription('@scope/tool/startup', reader)).toBe('Root fallback.')
    expect(readModuleDescription('plain-name/subpath', reader)).toBe(null)
  })

  it('probes bare package rows once and skips manifests without usable text', () => {
    const probes: string[] = []
    const reader = (specifier: string): string => {
      probes.push(specifier)
      return manifestResolver({ 'cordis:builtin/package.json': {} })(
        specifier,
      )
    }
    expect(readModuleDescription('cordis:builtin', reader)).toBe(null)
    expect(probes).toEqual(['cordis:builtin/package.json'])
  })

  it('treats blank descriptions as missing and reports null when nothing resolves', () => {
    const reader = manifestResolver({
      'broken/package.json': { description: '   ' },
    })
    expect(readModuleDescription('broken', reader)).toBe(null)
    expect(readModuleDescription('ghost-package', unresolved)).toBe(null)
  })
})

describe('PluginInventoryGateway', () => {
  it('publishes one direct list method under the pluginInventory namespace', async () => {
    const { inventory } = await harness()
    expect(inventory.typertRemote).toMatchObject({
      serviceKey: 'pluginInventory',
      namespace: 'pluginInventory',
    })
    expect(remoteMethods(inventory)).toEqual([
      { method: 'list', invocation: { kind: 'direct' } },
    ])
  })

  it('projects current non-group Loader entries without a second cache', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const pendingId = await ctx.loader.create({ name: 'cordis:pending' })
    const disabledId = await ctx.loader.create({
      name: 'cordis:not-installed',
      disabled: true,
    })
    await ctx.loader.create({ name: 'cordis:active', group: true })
    inventory.readDescription = moduleName =>
      moduleName === 'cordis:active' ? 'Fixture plugin used by the inventory spec.' : null

    const snapshot = inventory.list()
    expect(snapshot.entries).toHaveLength(3)
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      {
        entryId: activeId,
        moduleName: 'cordis:active',
        description: 'Fixture plugin used by the inventory spec.',
        enabled: true,
        fiberPhase: 'active',
      },
      {
        entryId: pendingId,
        moduleName: 'cordis:pending',
        description: null,
        enabled: true,
        fiberPhase: 'pending',
      },
      {
        entryId: disabledId,
        moduleName: 'cordis:not-installed',
        description: null,
        enabled: false,
        fiberPhase: null,
      },
    ]))

    await ctx.loader.update(activeId, { disabled: true })
    expect(inventory.list().entries.find(entry => entry.entryId === activeId)).toEqual({
      entryId: activeId,
      moduleName: 'cordis:active',
      description: 'Fixture plugin used by the inventory spec.',
      enabled: false,
      fiberPhase: null,
    })

    await ctx.loader.remove(pendingId)
    expect(inventory.list().entries.some(entry => entry.entryId === pendingId)).toBe(false)
  })

  it('carries per-entry descriptions through the injected reader by Loader order', async () => {
    const { ctx, inventory } = await harness()
    const firstId = await ctx.loader.create({ name: 'cordis:first' })
    const secondId = await ctx.loader.create({ name: 'cordis:second' })
    inventory.readDescription = moduleName => moduleName.endsWith(':first')
      ? 'First fixture description.'
      : null
    const snapshot = inventory.list()
    const byEntryId = new Map<string, PluginInventoryEntry>(
      snapshot.entries.map(entry => [entry.entryId, entry]),
    )
    expect(byEntryId.get(firstId)?.description).toBe('First fixture description.')
    expect(byEntryId.get(secondId)?.description).toBe(null)
  })

  it('reads descriptions through the installed tree and reports null for unresolvable names', async () => {
    const { ctx, inventory } = await harness()
    const activeId = await ctx.loader.create({ name: 'cordis:active' })
    const snapshot = inventory.list()
    // The installed-profile resolver cannot resolve builtin specifiers; the
    // projection degrades to null instead of failing the snapshot.
    expect(snapshot.entries.find(entry => entry.entryId === activeId)?.description).toBe(null)
  })
})
