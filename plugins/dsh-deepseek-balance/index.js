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
import { readFile } from 'node:fs/promises'
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
 * Launch the detached updater script; the process outlives the server (which
 * the updater itself will restart), so it must detach from the host's job tree.
 * @param ctx - the mounting Cordis context.
 * @param opsDir - directory containing update-dsh.ps1.
 * @returns the launch result record.
 */
async function launchUpdater(ctx, opsDir) {
  const script = join(opsDir, 'update-dsh.ps1')
  const child = spawn('C:\\Program Files\\PowerShell\\7\\pwsh.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: opsDir,
  })
  child.unref()
  return { started: true, pid: child.pid !== undefined ? child.pid : 0, script }
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
        sendJson(res, 200, { ok: true, ...launched })
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

