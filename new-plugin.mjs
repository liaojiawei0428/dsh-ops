#!/usr/bin/env node
/**
 * new-plugin.mjs — scaffold a standard-compliant DSH plugin skeleton.
 *
 * The scaffold is the compliance floor of the DSH plugin standard
 * (PLUGIN-STANDARD.md): correct package structure, insert-dialect patch file,
 * zero workspace imports, minimal injections, effect-wrapped registrations,
 * and a README that carries the verification steps. A plugin that starts here
 * passes the pre-flight gate by construction.
 *
 * Usage:  node new-plugin.mjs <name>          # name like dsh-tool-foo (no scope)
 *         node new-plugin.mjs <name> --dir D:/GongJu/DSH-ops/plugins
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argName = process.argv[2]
if (argName === undefined || !/^dsh-[a-z0-9-]+$/.test(argName)) {
  console.error('usage: node new-plugin.mjs <name>   # name must match ^dsh-[a-z0-9-]+$ (e.g. dsh-tool-foo)')
  process.exit(1)
}
const dirIdx = process.argv.indexOf('--dir')
const pluginsDir = join(dirname(fileURLToPath(import.meta.url)), 'plugins')
const baseDir = dirIdx !== -1 ? resolve(process.argv[dirIdx + 1]) : pluginsDir
const dir = join(baseDir, argName)
if (existsSync(dir)) {
  console.error(`refusing to overwrite existing directory: ${dir}`)
  process.exit(1)
}

const rowId = argName.replace(/^dsh-/, '')

const files = {
  'package.json': `${JSON.stringify({
    name: argName,
    version: '0.1.0',
    description: `DSH system component: ${argName}`,
    private: true,
    type: 'module',
    main: 'index.js',
    exports: {
      '.': './index.js',
      './cordis.patch.yml': './cordis.patch.yml',
      './package.json': './package.json',
    },
    license: 'MIT',
    dsh: {
      bundle: { patch: './cordis.patch.yml' },
    },
  }, null, 2)}\n`,
  'cordis.patch.yml': `# ${argName} bundle patch — inserts one host-plane row.
#
# STANDARD: rows that only CONSUME host services sit loose with no realm; a row
# that PUBLISHES a service must sit behind an isolate realm in the mounting
# composition (see PLUGIN-STANDARD.md P9).
# Config goes in the deployment profile's cordis.patch.yml as an id-targeted
# override of this row, never as an edit to this file.
- insert:
    - id: ${rowId}
      name: ${argName}
`,
  'index.js': `/**
 * ${argName} — host half.
 *
 * STANDARD COMPLIANCE (PLUGIN-STANDARD.md):
 *  - P2 zero workspace imports: only node: builtins and injected services;
 *    a linked install has no node_modules to resolve @deepseek-ai/* from.
 *  - P3 minimal injections: list ONLY hard dependencies (the row waits for
 *    them at load); read optional services with ctx.get('name') instead.
 *  - P5 registrations are effects: wrap every registry contribution in
 *    ctx.effect(() => disposer).
 *  - P6 fail loud at load for config errors (the pre-flight gate catches this
 *    before the server restarts); fail as a tool error at execute time.
 */

export const name = '${rowId}'

/** Hard service dependencies only; see P3 before adding one. */
export const inject = []

/**
 * Plugin body.
 * @param ctx - host root context.
 * @param config - resolved plugin config from the composition row.
 */
export function apply(ctx, config = {}) {
  // Example effect-wrapped registration skeleton (P5):
  //
  // ctx.effect(() => ctx.tools.register({
  //   name: 'mytool',
  //   description: '...',
  //   parameters: { /* registry JSON Schema dialect; see P4 */ },
  //   output: {
  //     schema: { type: 'object', additionalProperties: false, required: ['result'], properties: { result: { type: 'string' } } },
  //     render: (_args, value) => [{ type: 'text', text: value.result }],
  //   },
  //   async execute(args, exec) { return { result: 'ok' } },
  // }))
}
`,
  'README.md': `# ${argName}

DSH 系统组件（骨架）。遵循 [PLUGIN-STANDARD.md](../PLUGIN-STANDARD.md) 行为准则开发。

## 开发循环

1. 编辑 \`index.js\`；遵守准则 P1–P10
2. 随时验证：\`node D:/GongJu/DSH-ops/validate-plugins.mjs\` —— 必须全绿才能进入安装
3. 浏览器半端（可选）：\`package.json\` 加 \`dsh.client\` 声明并新建 \`client.js\`（闸门会做语法检查）

## 安装（三步）

1. profile \`package.json\` 的 \`dependencies\` 加：
   \`"${argName}": "link:${baseDir.replace(/\\/g, '/')}/${argName}"\`
2. \`dsh.profile.bundles\` 数组追加 \`"${argName}"\`
3. profile 目录执行 \`pnpm install\`，然后重启服务（预检闸门自动运行）

## 验证

- \`node D:/GongJu/Deepseek_DSH/apps/cli/lib/bin.js --profile web --dump-config\` 出现 \`id: ${rowId}\` 行
- 新会话确认行为

## 已知边界

（骨架：列出该插件不做什么）
`,
}

await mkdir(dir, { recursive: true })
for (const [name, content] of Object.entries(files)) {
  await writeFile(join(dir, name), content, 'utf8')
}
console.log(`created ${dir}`)
console.log(`next: node D:/GongJu/DSH-ops/validate-plugins.mjs   # must PASS before install`)
