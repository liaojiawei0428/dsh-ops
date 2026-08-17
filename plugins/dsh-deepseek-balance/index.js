/**
 * dsh-deepseek-balance — a zero-dependency dual-face host plugin.
 *
 * Host half: registers the HTTP route `/api/dsh/deepseek-balance` on the
 * deployment's `webServer`, resolving the key from the `credentials` service
 * and calling the official DeepSeek `/user/balance` endpoint with the Node
 * runtime's native fetch. Responses carry a short TTL cache so repeated
 * browser mounts do not hammer the API.
 *
 * The browser half (`./client.js`) renders the balance capsule in the session
 * header utilities row and fetches this route.
 */

/** Balance cache TTL — repeated mounts within this window reuse the last fetch. */
const TTL_MS = 60000

/** Cache of the last successful balance plus its fetch timestamp. */
let cache = undefined
let cacheAt = 0

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
export function apply(ctx) {
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
  }), 'dsh-deepseek-balance: route')
}
