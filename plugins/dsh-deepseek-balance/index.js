/**
 * dsh-deepseek-balance — a zero-dependency dual-face host plugin.
 *
 * Host half: registers the HTTP routes `/api/dsh/deepseek-balance`,
 * `/api/dsh/repo-status`, and `/api/dsh/update-now` on the deployment's
 * `webServer`. The balance route resolves the key from the `credentials`
 * service and calls the official DeepSeek `/user/balance` endpoint with the
 * Node runtime's native fetch; responses carry a short TTL cache. The
 * repo-status route reports the local DSH version vs the official remote
 * (git fetch through the system proxy, checked on an hourly timer), and
 * update-now launches the detached updater script.
 *
 * The browser half (`./client.js`) renders the balance capsule plus a version
 * capsule in the session header utilities row.
 */

import { execFile, spawn } from 'node:child_process'
import { access, constants, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Deployment-layout defaults derived from this file's own location, so any
 * drive letter works as long as the sibling layout holds:
 *   <root>/Deepseek_DSH   (official repo)
 *   <root>/DSH-ops        (this repo; this plugin lives at DSH-ops/plugins/…)
 */
const OPS_DIR = resolveOpsDir()
const REPO_DIR = join(dirname(OPS_DIR), 'Deepseek_DSH')

/** Resolve the DSH-ops directory from this module's path (two levels up: plugins/<name>/index.js → DSH-ops). */
function resolveOpsDir() {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..')
}

/** Balance cache TTL — repeated mounts within this window reuse the last fetch. */
const TTL_MS = 60000

/** Cache of the last successful balance plus its fetch timestamp. */
let cache = undefined
let cacheAt = 0

/** System proxy read from the registry, cached per process. */
let proxyCache = undefined

/**
 * Read the Windows system proxy (ProxyEnable/ProxyServer) once per process.
 * @returns `{ url }` when enabled, `{ url: undefined }` when disabled.
 */
async function readSystemProxy() {
  if (proxyCache !== undefined) return proxyCache
  try {
    const { stdout } = await execFileAsync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
      '/v', 'ProxyEnable',
    ], { timeout: 5000 })
    const enabled = /0x1\b/.test(stdout)
    let url
    if (enabled) {
      try {
        const { stdout: serverOut } = await execFileAsync('reg', [
          'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
          '/v', 'ProxyServer',
        ], { timeout: 5000 })
        const match = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S+)/)
        url = match ? match[1] : undefined
      } catch { url = undefined }
    }
    proxyCache = { url }
    return proxyCache
  } catch {
    proxyCache = { url: undefined }
    return proxyCache
  }
}

/**
 * Run one git command against the repo with the system proxy injected.
 * @param repoDir - the DSH checkout directory.
 * @param args - git arguments.
 * @returns the resolved stdout.
 */
async function git(repoDir, args) {
  const proxy = await readSystemProxy()
  const env = { ...process.env }
  if (proxy.url !== undefined) {
    const normalized = proxy.url.startsWith('http') ? proxy.url : `http://${proxy.url}`
    env.HTTP_PROXY = normalized
    env.HTTPS_PROXY = normalized
  }
  const { stdout } = await execFileAsync('git', ['-C', repoDir, ...args], {
    env,
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  })
  return stdout.trim()
}

/**
 * Perform one repo update check: local version + HEAD vs remote master.
 * Never throws — every failure becomes a `checkError` field so the capsule
 * still renders the local version.
 * @param repoDir - the DSH checkout directory.
 * @returns the repo status record.
 */
async function checkRepoUpdate(repoDir) {
  const record = {
    version: 'unknown',
    current: '',
    latest: '',
    hasUpdate: false,
    checkedAt: Date.now(),
    checkError: undefined,
  }
  try {
    const pkg = JSON.parse(await readFile(join(repoDir, 'package.json'), 'utf8'))
    record.version = typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch { record.checkError = 'cannot read package.json' }
  try {
    await git(repoDir, ['fetch', 'origin'])
    record.current = (await git(repoDir, ['rev-parse', 'HEAD'])).slice(0, 12)
    record.latest = (await git(repoDir, ['rev-parse', 'origin/master'])).slice(0, 12)
    record.hasUpdate = record.current.length > 0 && record.current !== record.latest
  } catch (e) {
    record.checkError = 'update check failed: ' + String(e && e.message ? e.message : e)
  }
  return record
}

/**
 * Resolve the pwsh 7 executable without hard-coding one machine's install
 * path (E:\GongJu\7\pwsh.exe here; the default C:\Program Files\PowerShell\7
 * does not exist on this deployment). Order: DSH_PWSH_PATH override → every
 * PATH entry → the two Program Files default install locations.
 * @returns `{ path, source }` of the first existing executable — source is
 *   'override' | 'path' | 'default' so the caller can tell whether a bare
 *   `pwsh.exe` inside 启动DSH.bat would also resolve — or `undefined`.
 */
async function resolvePwsh() {
  const candidates = []
  const override = process.env.DSH_PWSH_PATH
  if (typeof override === 'string' && override.length > 0) candidates.push({ path: override, source: 'override' })
  for (const dir of String(process.env.PATH || '').split(';')) {
    if (dir.length > 0) candidates.push({ path: join(dir, 'pwsh.exe'), source: 'path' })
  }
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  candidates.push({ path: join(pf, 'PowerShell\\7\\pwsh.exe'), source: 'default' })
  candidates.push({ path: join(pf86, 'PowerShell\\7\\pwsh.exe'), source: 'default' })
  const seen = new Set()
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue
    seen.add(candidate.path)
    try {
      await access(candidate.path, constants.X_OK)
      return candidate
    } catch { /* try the next candidate */ }
  }
  return undefined
}

/**
 * Launch the updater in a VISIBLE console window so the user watches the whole
 * run (git pull, dependency install, build) exactly like double-clicking
 * 更新DSH.bat — instead of a hidden background process behind a flat
 * "正在更新…" capsule. The window outlives the server (which the updater
 * itself restarts), so it must detach from the host's job tree.
 *
 * `cmd /c start "" <target>` opens a brand-new console whose stdio points at
 * that console (not at this process), so every progress line is visible:
 *   - pwsh resolvable via PATH → run 更新DSH.bat itself (same UX as manual:
 *     success auto-closes after ~3s, failure pauses with the error on screen)
 *   - pwsh only via override/default paths → run update-dsh.ps1 with the
 *     absolute executable (window closes when done; failures land in
 *     dsh-update.log, which the capsule tooltips point at)
 * DSH_UPDATE_SOURCE=auto flows through env so the version ledger attributes
 * the run to the automatic path. Resolves only after the child actually
 * spawned (or failed to) — a missing pwsh.exe is reported to the capsule
 * instead of a silent no-op.
 * @param ctx - the mounting Cordis context.
 * @param opsDir - directory containing update-dsh.ps1 / 更新DSH.bat.
 * @returns `{ started: true, pid, window }` or `{ started: false, error }`.
 */
async function launchUpdater(ctx, opsDir) {
  const found = await resolvePwsh()
  if (found === undefined) {
    return { started: false, error: '未找到 pwsh 7（已尝试 DSH_PWSH_PATH、PATH、Program Files）' }
  }
  const script = join(opsDir, 'update-dsh.ps1')
  const launcher = join(opsDir, '更新DSH.bat')
  // '' (empty string) becomes the start command's empty window title — the
  // canonical `start "" "target"` idiom; Node quotes the bat path only when
  // it contains spaces, which `start` handles correctly.
  let args
  let window
  if (found.source === 'path') {
    args = ['/d', '/c', 'start', '', launcher]
    window = launcher + '（可见窗口）'
  } else {
    args = ['/d', '/c', 'start', '', found.path, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script]
    window = script + '（可见窗口, pwsh=' + found.path + '）'
  }
  return await new Promise((resolve) => {
    let settled = false
    const settle = (value) => { if (!settled) { settled = true; resolve(value) } }
    let child
    try {
      child = spawn('cmd.exe', args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        cwd: opsDir,
        env: { ...process.env, DSH_UPDATE_SOURCE: 'auto' },
      })
    } catch (e) {
      settle({ started: false, error: String(e && e.message ? e.message : e) })
      return
    }
    child.once('spawn', () => {
      child.unref()
    })
    // cmd exits as soon as `start` has created the window; its exit code is
    // the reliable "window actually opened" signal (0 = yes, non-zero = start
    // failed, e.g. target path missing).
    child.once('exit', (code) => {
      if (code === 0) {
        settle({ started: true, pid: child.pid !== undefined ? child.pid : 0, window })
      } else {
        settle({ started: false, error: 'cmd start 退出码 ' + code + '（更新窗口未能打开）' })
      }
    })
    child.once('error', (e) => {
      settle({ started: false, error: String(e && e.message ? e.message : e) })
    })
  })
}

/** Cache of the last successful repo status plus its fetch timestamp. */
let repoStatus = undefined
let repoCheckedAt = 0

/** One in-flight update check so concurrent callers reuse the same fetch. */
let repoCheckInFlight = undefined

/**
 * Resolve the repo status, fetching when the cache is stale or a force is
 * requested.
 * @param repoDir - the DSH checkout directory.
 * @param intervalMs - the cache freshness window.
 * @param force - bypass the freshness window.
 * @returns the repo status record.
 */
async function resolveRepoStatus(repoDir, intervalMs, force) {
  const now = Date.now()
  if (!force && repoStatus !== undefined && now - repoCheckedAt < intervalMs) {
    return repoStatus
  }
  if (repoCheckInFlight !== undefined) return repoCheckInFlight
  repoCheckInFlight = (async () => {
    try {
      const status = await checkRepoUpdate(repoDir)
      repoStatus = status
      repoCheckedAt = Date.now()
      return status
    } finally {
      repoCheckInFlight = undefined
    }
  })()
  return repoCheckInFlight
}

/**
 * Write one JSON response body with the given status code.
 * @param res - the Node server response.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Cordis plugin name. */
export const name = 'deepseek-balance'

/**
 * Required services: the deployment's web server. The web half mounts it only
 * after the command line is parsed (cmdlineArgs → webStartup → webServer), so
 * an entry without this inject applies before the service exists and fails the
 * whole tree.
 */
export const inject = ['webServer']

/**
 * Register the balance route on the deployment's web server.
 * @param ctx - the mounting Cordis context with the webServer service.
 */
export function apply(ctx, config = {}) {
  const repoDir = typeof config.repoDir === 'string' && config.repoDir.length > 0
    ? config.repoDir
    : REPO_DIR
  const opsDir = typeof config.opsDir === 'string' && config.opsDir.length > 0
    ? config.opsDir
    : OPS_DIR
  const checkIntervalMs = typeof config.checkIntervalMs === 'number' && Number.isFinite(config.checkIntervalMs) && config.checkIntervalMs > 0
    ? config.checkIntervalMs
    : 60 * 60 * 1000

  // Hourly repo update check; the first run happens immediately.
  const timer = setInterval(() => {
    void resolveRepoStatus(repoDir, checkIntervalMs, true).catch(() => {})
  }, checkIntervalMs)
  ctx.effect(() => () => clearInterval(timer), 'dsh-deepseek-balance: update-check timer')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh/deepseek-balance',
    handler: async (_req, res) => {
      try {
        const now = Date.now()
        let balance
        let cached = false
        if (cache !== undefined && now - cacheAt < TTL_MS) {
          balance = cache
          cached = true
        } else {
          const result = await queryBalance(ctx)
          if (!result.ok) {
            sendJson(res, 502, result)
            return
          }
          balance = result.balance
          cache = balance
          cacheAt = now
        }
        sendJson(res, 200, { ok: true, cached, balance })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: 'internal: ' + String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-deepseek-balance: balance route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh/repo-status',
    handler: async (_req, res) => {
      try {
        const force = _req.url !== undefined && /[?&]force=1/.test(_req.url)
        const status = await resolveRepoStatus(repoDir, checkIntervalMs, force)
        sendJson(res, 200, status)
      } catch (e) {
        sendJson(res, 500, { ok: false, error: 'internal: ' + String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-deepseek-balance: repo-status route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/api/dsh/update-now',
    handler: async (_req, res) => {
      try {
        const launched = await launchUpdater(ctx, opsDir)
        sendJson(res, launched.started ? 200 : 500, { ok: launched.started, ...launched })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: 'internal: ' + String(e && e.message ? e.message : e) })
      }
    },
  }), 'dsh-deepseek-balance: update-now route')
}

/**
 * Query the DeepSeek balance API once, resolving the key per call so a
 * changed credential reaches the next operation without a restart.
 * @param ctx - the mounting Cordis context (for the credentials service).
 * @returns balance fields, or `{ ok: false, error }` on any failure.
 */
async function queryBalance(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) return { ok: false, error: 'credentials service unavailable' }

  let resolved
  try {
    resolved = await credentials.resolve('DEEPSEEK_API_KEY')
  } catch (e) {
    return { ok: false, error: 'credential resolve failed: ' + String(e && e.message ? e.message : e) }
  }
  if (resolved === undefined) return { ok: false, error: 'DEEPSEEK_API_KEY 未配置' }

  let response
  try {
    response = await fetch('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + resolved.value },
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    })
  } catch (e) {
    return { ok: false, error: 'request failed: ' + String(e && e.message ? e.message : e) }
  }

  if (response.status !== 200) {
    return { ok: false, error: 'balance API HTTP ' + response.status }
  }

  let data
  try {
    data = await response.json()
  } catch (e) {
    return { ok: false, error: 'balance API 返回了非 JSON 内容' }
  }
  const info = data && Array.isArray(data.balance_infos) && data.balance_infos[0] ? data.balance_infos[0] : undefined
  if (info === undefined) return { ok: false, error: 'balance_infos 缺失于 API 响应' }

  return {
    ok: true,
    balance: {
      isAvailable: data.is_available === true,
      currency: typeof info.currency === 'string' ? info.currency : '',
      total: typeof info.total_balance === 'string' ? info.total_balance : '',
      granted: typeof info.granted_balance === 'string' ? info.granted_balance : '',
      toppedUp: typeof info.topped_up_balance === 'string' ? info.topped_up_balance : '',
    },
  }
}

