#!/usr/bin/env node
/**
 * functional-parity.mjs — 部署功能一致性核对（导出基线 / 在新机核对）。
 *
 * 为什么需要它：新机「部署出同一套 DSH」的判据是**功能**一致，而不是密钥一致。
 * 代码与插件由 bootstrap 按版本锚点自动装好；真正承载功能身份的是**用户数据里的配置**——
 * 其中 `settings.yaml` 定义了全部 provider 网关（baseURL / 协议 / 模型目录 / compat）、
 * 默认模型、子代理授权清单、权限预设、shell 超时等，而它在仓库里只有一份 7 段骨架。
 * 凭据（`.credentials.yaml` 里的 Key **值**）则是每台机器自己的事，本脚本**从不读取、
 * 也不比较任何密钥值**，只核对「引用名是否齐」。
 *
 * 两种用法：
 *   node functional-parity.mjs --export [--out <file>]     在参照机（开发机）导出功能基线
 *   node functional-parity.mjs --check [--expected <file>] 在新机核对（默认读 config/expected-functional.json）
 *
 * 核对项与判定：
 *   FAIL  功能项不一致（版本 / 补丁数 / bundle 清单 / provider 网关与模型目录 / 默认模型 /
 *         子代理授权清单 / 权限预设 / shell 超时 / 覆盖层里 web-search-deepseek 的功能配置…）
 *   WARN  功能上需要、但属于「本机自己填」的东西缺失——目前只有凭据引用名
 *   INFO  机器特定项（link 依赖是否指向本机、pythonPath/pwshPath 是否存在），不参与判定
 *
 * 退出码：0 = 无 FAIL；1 = 至少一项功能不一致。
 */

import { existsSync, readdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const OPS_DIR = dirname(fileURLToPath(import.meta.url))
const COPY_DIR = join(OPS_DIR, 'Deepseek_DSH')
const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = process.env.DSH_PROFILE_DIR ?? join(DSH_HOME, 'profiles', 'web')
const GUIDE_CLIENT = join(OPS_DIR, 'plugins/dsh-plugin-guide/client.js')
const DEFAULT_EXPECTED = join(OPS_DIR, 'config/expected-functional.json')

const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}
const MODE = argv.includes('--export') ? 'export' : argv.includes('--check') ? 'check' : null
if (MODE === null) {
  console.error('用法: node functional-parity.mjs --export [--out <file>] | --check [--expected <file>]')
  process.exit(2)
}

/**
 * Load the YAML parser out of the runtime copy's pnpm store. The official
 * lockfile pins `yaml`, and pnpm keeps it under the copy's own store
 * (`node_modules/.pnpm/yaml@<version>/node_modules/yaml`);
 * resolving from there keeps this gate free of its own dependencies (and works
 * on a fresh machine before anything else is installed).
 */
function loadYaml() {
  const pnpm = join(COPY_DIR, 'node_modules', '.pnpm')
  if (!existsSync(pnpm)) throw new Error(`找不到运行副本的依赖目录: ${pnpm}（先跑第 2 步 bootstrap）`)
  const candidates = readdirSync(pnpm).filter((d) => /^yaml@/.test(d)).sort().reverse()
  for (const dir of candidates) {
    const pkg = join(pnpm, dir, 'node_modules', 'yaml')
    if (!existsSync(pkg)) continue
    try {
      return createRequire(join(OPS_DIR, 'noop.js'))(pkg)
    } catch { /* try the next one */ }
  }
  throw new Error(`运行副本里找不到 yaml 包（${pnpm}）——依赖未安装完整？`)
}

const YAML = loadYaml()

const readText = async (path) => {
  if (!existsSync(path)) throw new Error(`缺少文件: ${path}`)
  return readFile(path, 'utf8')
}
const readYaml = async (path) => YAML.parse(await readText(path))

/** Count `file:` entries and `restore` entries in the patch manifest. */
async function readPatchCounts() {
  const source = await readText(join(OPS_DIR, 'official-patches/apply-patches.mjs'))
  const patches = (source.match(/\bfile:\s*['"]/g) ?? []).length
  const restoreBlock = source.slice(source.indexOf('const restore'))
  const restore = (restoreBlock.match(/\bfrom:\s*['"]/g) ?? []).length
  return { patches, restore }
}

/** Read the profile's declared bundle list and its link: dependency names. */
async function readProfile() {
  const manifest = JSON.parse(await readText(join(PROFILE_DIR, 'package.json')))
  const bundles = manifest?.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) throw new Error(`profile 缺少 dsh.profile.bundles: ${PROFILE_DIR}`)
  const deps = manifest?.dependencies ?? {}
  const linkEntries = Object.entries(deps).filter(([, v]) => String(v).startsWith('link:'))
  return {
    bundles,
    linkPlugins: linkEntries.map(([k]) => k).sort(),
    linkTargets: Object.fromEntries(linkEntries),
  }
}

/** Read BUNDLE_COPY keys textually (same technique as check-plugin-copy.mjs). */
async function readCopyKeys() {
  const source = await readText(GUIDE_CLIENT)
  const start = source.indexOf('const BUNDLE_COPY')
  if (start === -1) throw new Error(`BUNDLE_COPY 未找到: ${GUIDE_CLIENT}`)
  const end = source.indexOf('\n    }', start)
  const block = source.slice(start, end === -1 ? undefined : end)
  const keys = new Set()
  for (const m of block.matchAll(/'([^']+)':\s*\[\s*'/g)) keys.add(m[1])
  return [...keys].sort()
}

/** Functional view of one settings.yaml provider profile (no secrets, no paths). */
const providerView = (profile) => ({
  api: profile.api ?? null,
  baseURL: profile.baseURL ?? null,
  harnessSessionHeader: profile.harnessSessionHeader ?? false,
  defaultContextWindow: profile.defaultContextWindow ?? null,
  defaultMaxTokens: profile.defaultMaxTokens ?? null,
  models: (profile.models ?? []).map((m) => m.id).sort(),
})

/**
 * The capacity a model actually gets, following the official resolution chain
 * (`llm-pi-ai/src/catalog.ts:901,905`): model entry → catalog/base → the provider
 * profile's default → the code constant (`llm-pi-ai/src/config.ts:64,67`).
 * The catalog step is not visible from configuration, so a model that is absent
 * from the catalog and carries neither its own nor a provider-level value ends up
 * on the code constant — reproducible today, but silently movable by an official
 * upgrade. Such rows are recorded here and flagged on check.
 */
const DEFAULT_CONTEXT_WINDOW = 262_144
const DEFAULT_MAX_TOKENS = 32_768
function capacityRows(settings) {
  const rows = []
  for (const [provider, profile] of Object.entries(settings['llm-pi-ai']?.providers ?? {})) {
    for (const model of profile.models ?? []) {
      if (model.contextWindow !== undefined && model.maxTokens !== undefined) continue
      rows.push({
        provider,
        model: model.id,
        contextWindow: model.contextWindow ?? profile.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
        maxTokens: model.maxTokens ?? profile.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
        source: model.contextWindow !== undefined
          ? 'model'
          : profile.defaultContextWindow !== undefined ? 'provider-default' : 'implicit-code-default',
      })
    }
  }
  return rows.sort((a, b) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`))
}

/** Everything that defines THIS deployment's behaviour, minus secrets and paths. */
async function collect() {
  const settings = await readYaml(join(DSH_HOME, 'settings.yaml'))
  const overlay = await readYaml(join(PROFILE_DIR, 'cordis.patch.yml'))
  const profile = await readProfile()
  const { patches, restore } = await readPatchCounts()

  const providers = {}
  for (const [name, profile_] of Object.entries(settings['llm-pi-ai']?.providers ?? {})) {
    providers[name] = providerView(profile_)
  }

  const managed = {}
  for (const row of Array.isArray(overlay) ? overlay : []) {
    if (row === null || typeof row !== 'object' || row.id === undefined) continue
    if (row.config !== undefined) managed[row.id] = row.config
  }

  const copyKeys = await readCopyKeys()
  const settingsSections = Object.keys(settings).sort()

  return {
    _note: '功能基线：只含行为配置，不含任何密钥值与机器特定路径',
    dsh_version: JSON.parse(await readText(join(COPY_DIR, 'package.json'))).version,
    official_ref: (await readText(join(OPS_DIR, 'official-patches/official-ref.txt')))
      .split('\n').map((l) => l.trim()).filter((l) => l !== '' && !l.startsWith('#'))[0] ?? null,
    patches_count: patches,
    restore_count: restore,
    bundles: profile.bundles,
    link_plugins: profile.linkPlugins,
    plugins_on_disk: readdirSync(join(OPS_DIR, 'plugins'), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name).sort(),
    plugin_copy_keys: copyKeys,
    settings_sections: settingsSections,
    agent_default_model: {
      provider: settings['agent-default-model']?.provider ?? null,
      model: settings['agent-default-model']?.model ?? null,
      reasoningEffort: settings['agent-default-model']?.reasoningEffort ?? null,
    },
    agent_presets_default: settings['agent-presets']?.default ?? null,
    permission_default_preset: settings['permission']?.defaultPreset ?? null,
    shell_timeout_ms: settings['shell']?.timeoutMs ?? null,
    ui_conversation_busy_enter: settings['ui-conversation']?.busyEnter ?? null,
    // llm-deepseek 是内置 provider 的**模型目录覆盖**：空段/缺段时走官方默认目录，
    // 与开发机显式覆盖过的目录（含 vision 变体与图像预算）不是同一套，必须逐项核对。
    llm_deepseek_models: (settings['llm-deepseek']?.models ?? []).map((m) => ({
      id: m.id,
      name: m.name ?? null,
      contextWindow: m.contextWindow ?? null,
      inputModalities: m.inputModalities ?? null,
      imagePixelBudget: m.imagePixelBudget ?? null,
      imageMaxBytes: m.imageMaxBytes ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    capacity_rows: capacityRows(settings),
    providers,
    subagent_model_selection: {
      enabled: settings['subagent-model-selection']?.enabled ?? false,
      allowedModels: (settings['subagent-model-selection']?.allowedModels ?? [])
        .map((m) => `${m.provider}/${m.model}`).sort(),
    },
    overlay: {
      web_search_deepseek: managed['web-search-deepseek'] ?? null,
      managed_ids: Object.keys(managed).sort(),
    },
    required_credential_refs: [...new Set([
      ...Object.values(settings['llm-pi-ai']?.providers ?? {}).map((p) => p.apiKeyEnv).filter(Boolean),
      managed['web-search-deepseek']?.apiKeyEnv,
      'DEEPSEEK_API_KEY',
    ].filter(Boolean))].sort(),
    _machine_specific: {
      note: '以下只用于提示，不参与功能一致性判定',
      link_targets: profile.linkTargets,
      pythonPath: managed['tool-python']?.pythonPath ?? null,
      pwshPath: managed['pwsh-sandbox']?.pwshPath ?? null,
    },
  }
}

/** Names present in the credential store — values are never read. */
async function credentialRefNames() {
  const path = join(DSH_HOME, '.credentials.yaml')
  if (!existsSync(path)) return new Set()
  const doc = await readYaml(path)
  const names = new Set(Object.keys(doc?.refs ?? {}))
  for (const key of Object.keys(doc?.records ?? {})) names.add(key)
  return names
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const show = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s === undefined ? 'null' : s.length > 68 ? `${s.slice(0, 65)}…` : s
}

if (MODE === 'export') {
  const out = resolve(argOf('--out') ?? DEFAULT_EXPECTED)
  const data = await collect()
  // 基线只描述功能：link 依赖的**绝对路径**是每台机器自己的事（名字已在 link_plugins 里），
  // 留在基线里既没用又会把参照机的盘符固化进去。
  delete data._machine_specific.link_targets
  data.generated_at = new Date().toISOString()
  data.generated_on = process.env.COMPUTERNAME ?? null
  await writeFile(out, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`已导出功能基线: ${out}`)
  console.log(`  provider ${Object.keys(data.providers).length} 个 · bundle ${data.bundles.length} 条 · `
    + `link 插件 ${data.link_plugins.length} 个 · 需要的凭据名 ${data.required_credential_refs.length} 个`)
  console.log('  内容不含任何密钥值；可安全提交入库。')
  process.exit(0)
}

// ---------------------------------------------------------------- check mode
const expectedPath = resolve(argOf('--expected') ?? DEFAULT_EXPECTED)
if (!existsSync(expectedPath)) {
  console.error(`找不到功能基线文件: ${expectedPath}`)
  console.error('在参照机上执行 `node functional-parity.mjs --export` 生成后再来核对。')
  process.exit(2)
}
const expected = JSON.parse(await readFile(expectedPath, 'utf8'))
const actual = await collect()

const rows = []
const add = (level, item, want, got) => rows.push({ level, item, want, got })

const scalars = [
  ['DSH 版本', 'dsh_version'],
  ['官方源码锚点', 'official_ref'],
  ['补丁条数', 'patches_count'],
  ['restore 项数', 'restore_count'],
  ['默认模型 provider', 'agent_default_model'],
  ['agent-presets.default', 'agent_presets_default'],
  ['permission.defaultPreset', 'permission_default_preset'],
  ['shell.timeoutMs', 'shell_timeout_ms'],
  ['ui-conversation.busyEnter', 'ui_conversation_busy_enter'],
  ['子代理授权清单', 'subagent_model_selection'],
  ['llm-deepseek 模型目录覆盖', 'llm_deepseek_models'],
  ['模型容量（按解析链算出的生效值）', 'capacity_rows'],
  ['profile bundle 清单（顺序敏感）', 'bundles'],
  ['settings 顶层段', 'settings_sections'],
  ['自研插件目录', 'plugins_on_disk'],
  ['插件中文名表键集', 'plugin_copy_keys'],
  ['覆盖层托管条目 id', 'overlay.managed_ids'],
]
for (const [label, key] of scalars) {
  const want = key.includes('.') ? key.split('.').reduce((o, k) => o?.[k], expected) : expected[key]
  const got = key.includes('.') ? key.split('.').reduce((o, k) => o?.[k], actual) : actual[key]
  add(same(want, got) ? 'OK' : 'FAIL', label, want, got)
}

// provider gateways: the functional heart of "the same DSH"
for (const [name, want] of Object.entries(expected.providers ?? {})) {
  const got = actual.providers[name]
  if (got === undefined) { add('FAIL', `provider ${name}`, want, '(缺失)'); continue }
  add(same(want, got) ? 'OK' : 'FAIL', `provider ${name} 网关/协议/模型目录`, want, got)
}
for (const name of Object.keys(actual.providers)) {
  if (!(name in (expected.providers ?? {}))) {
    add('INFO', `provider ${name}`, '(基线里没有)', '(本机多出来的，不算不一致)')
  }
}

// web-search-deepseek's functional config (baseURL / apiKeyEnv / model) lives in the overlay
const wantWs = expected.overlay?.web_search_deepseek ?? null
const gotWs = actual.overlay?.web_search_deepseek ?? null
add(same(wantWs, gotWs) ? 'OK' : 'FAIL', '覆盖层 web-search-deepseek 功能配置', wantWs, gotWs)

// 容量若靠官方代码常量兜底：今天两边一致，但官方升级改常量时会悄悄漂移 → 提示显式钉住
const implicit = actual.capacity_rows.filter((r) => r.source === 'implicit-code-default')
add(implicit.length === 0 ? 'OK' : 'WARN', '模型容量是否有隐式兜底',
  '(无 —— 全部显式或由 provider 默认值确定)',
  implicit.length === 0 ? '无' : `${implicit.length} 个依赖官方常量: ${implicit.map((r) => `${r.provider}/${r.model}`).join(', ')}`)

// credentials: NAMES only — the values are this machine's own business
const haveRefs = await credentialRefNames()
const missingRefs = (expected.required_credential_refs ?? []).filter((r) => !haveRefs.has(r))
if (missingRefs.length > 0) {
  add('WARN', '凭据引用名', expected.required_credential_refs, `缺 ${missingRefs.join(', ')}`)
} else {
  add('OK', '凭据引用名（只看名字，不看值）', `${expected.required_credential_refs.length} 个`, '齐全')
}

// machine-specific: reported, never judged
const opsRoot = resolve(OPS_DIR) + sep
const outside = Object.entries(actual._machine_specific.link_targets)
  .filter(([, target]) => !resolve(String(target).replace(/^link:/, '')).startsWith(opsRoot))
  .map(([name]) => name)
add(outside.length === 0 ? 'OK' : 'WARN', 'link 依赖是否都指向本机仓库', '(全部在本机)',
  outside.length === 0 ? '全部在本机' : `指向外部: ${outside.join(', ')}`)
for (const [label, value] of [['tool-python.pythonPath', actual._machine_specific.pythonPath],
  ['pwsh-sandbox.pwshPath', actual._machine_specific.pwshPath]]) {
  add(value !== null && value !== undefined && existsSync(value) ? 'OK' : 'WARN', `${label}（机器特定）`,
    '(存在即可)', value ?? '(未设置)')
}

const width = Math.max(...rows.map((r) => r.item.length))
console.log(`功能一致性核对 —— 基线: ${expectedPath}`)
console.log(`  参照机: ${expected.generated_on ?? '?'} @ ${expected.generated_at ?? '?'}`)
console.log(`  本机  : ${process.env.COMPUTERNAME ?? '?'}  DSH_HOME=${DSH_HOME}`)
console.log('')
for (const r of rows) {
  const mark = r.level === 'OK' ? '✓' : r.level === 'WARN' ? '!' : r.level === 'INFO' ? 'i' : '✗'
  console.log(`  ${mark} ${r.item.padEnd(width)}  ${show(r.got)}`)
  if (r.level === 'FAIL') console.log(`      ${' '.repeat(width)}  期望: ${show(r.want)}`)
}

const fails = rows.filter((r) => r.level === 'FAIL')
const warns = rows.filter((r) => r.level === 'WARN')
console.log('')
console.log(`  一致 ${rows.filter((r) => r.level === 'OK').length} 项 · 不一致 ${fails.length} 项 · 提示 ${warns.length} 项`)
if (fails.length > 0) {
  console.log('')
  console.log('功能不一致项 —— 本机不是同一套 DSH。最常见原因：`settings.yaml` 没从参照机复制')
  console.log('（仓库模板只有 7 段骨架，缺 provider 网关 / 子代理授权清单 / shell 超时等）。')
  process.exit(1)
}
console.log('functional-parity: 功能一致 OK')
