import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { DescriptionStandardOptions } from './verify-package-descriptions.ts'
import {
  describeDescriptionViolation,
  inspectDshPackageDescriptions,
} from './verify-package-descriptions.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeManifest(root: string, file: string, manifest: Record<string, unknown>): void {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-package-descriptions-'))
  roots.push(root)
  writeManifest(root, 'package.json', {
    name: '@deepseek-ai/dsh-root',
    description: 'DeepSeek Harness workspace root manifest.',
    workspaces: ['apps/*', 'packages/*/*', 'vendor/*'],
  })
  return root
}

const PLUGIN: DescriptionStandardOptions = { plugin: true }
const LIBRARY: DescriptionStandardOptions = { plugin: false }

describe('package description standard', () => {
  it('names the violation class for each unusable description value', () => {
    expect(describeDescriptionViolation(undefined, PLUGIN)).toContain('non-empty')
    expect(describeDescriptionViolation('   \n', PLUGIN)).toContain('non-empty')
    expect(describeDescriptionViolation('目录浏览工具', PLUGIN)).toContain('shorter than 10')
    expect(describeDescriptionViolation('Directory browsing surface with creation primitives', PLUGIN))
      .toContain('must be written in Simplified Chinese')
    expect(describeDescriptionViolation('应用内目录浏览面：渲染目录列举与新建原语', PLUGIN)).toBe(null)

    expect(describeDescriptionViolation('tooling', LIBRARY)).toContain('shorter than')
    expect(describeDescriptionViolation('"quoted" start is punctuation and long enough', LIBRARY))
      .toContain('must start with a letter or "@"')
    expect(describeDescriptionViolation('Model-facing agent tools.', LIBRARY)).toBe(null)
    expect(describeDescriptionViolation('@deepseek-ai scoped tool package.', LIBRARY)).toBe(null)
  })

  it('checks every dsh-prefixed manifest while ignoring other families', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/core/agent/package.json', {
      name: '@deepseek-ai/dsh-agent',
      description: 'Agent spine that drives one model loop.',
    })
    writeManifest(root, 'packages/client/badge/package.json', {
      name: '@deepseek-ai/dsh-badge',
      dsh: { platform: 'web' },
      description: '客户端徽标插件：注册侧边栏徽标槽位并消费徽标投影',
    })
    writeManifest(root, 'apps/cli/package.json', {
      name: '@deepseek-ai/dsh',
      description: 'dsh CLI: profile boot, plugin management, and the browser UI alias',
    })
    writeManifest(root, 'vendor/cordis/package.json', {
      name: '@deepseek-ai/cordis',
      // The vendored framework predates the standard; the dsh gate skips it.
    })

    expect(inspectDshPackageDescriptions(root)).toEqual({
      packageCount: 4,
      failures: [],
    })
  })

  it('reports each violating package with a repository-relative path', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/util/codec/package.json', {
      name: '@deepseek-ai/dsh-codec',
      // No description: the exact gap the gate exists to reject.
    })
    writeManifest(root, 'packages/ui/badge/package.json', {
      name: '@deepseek-ai/dsh-badge',
      description: 'tiny',
    })
    writeManifest(root, 'packages/client/gauge/package.json', {
      name: '@deepseek-ai/dsh-gauge',
      dsh: { platform: 'web' },
      // An English sentence on a plugin manifest: the language gap the gate rejects.
      description: 'Gauge display widget for status rows and headers',
    })

    expect(inspectDshPackageDescriptions(root)).toEqual({
      packageCount: 4,
      failures: [
        'packages/client/gauge/package.json: @deepseek-ai/dsh-gauge "description" must be written in Simplified Chinese (the GUI shows it verbatim as the plugin explanation).',
        'packages/ui/badge/package.json: @deepseek-ai/dsh-badge "description" is shorter than 24 characters.',
        'packages/util/codec/package.json: @deepseek-ai/dsh-codec must declare a non-empty "description".',
      ],
    })
  })

  it('fails loud on a malformed workspaces declaration', () => {
    const root = createWorkspace()
    writeFileSync(join(root, 'package.json'), `${JSON.stringify({ workspaces: 'all' }, null, 2)}\n`)
    expect(() => inspectDshPackageDescriptions(root))
      .toThrow('workspaces must be a string array')
  })
})
