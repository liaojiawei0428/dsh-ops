/**
 * dsh-deepseek-balance — browser half (client bundle).
 *
 * Registers the balance capsule into the session header utilities row
 * (`conversation.session.header.utilities`, the same additive list slot that
 * hosts the Session log export button) and fetches the Host route
 * `/api/dsh/deepseek-balance` for the balance data.
 *
 * This file is a hand-written client bundle in the platform's module-loader
 * format: `window.__ModuleLoader__.load({ id, factory })`, with the factory's
 * `require` resolving platform seed words (react, @deepseek-ai/cordis, …).
 */
window.__ModuleLoader__.load({
  id: 'dsh-deepseek-balance',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    const CSS = [
      '.dsbal-hdr { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 6px 12px; gap: 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 18px; color: var(--dsw-alias-label-primary); background: transparent; font-family: var(--dsw-font-family); font-size: 13px; font-weight: 400; line-height: 20px; cursor: pointer; white-space: nowrap; }',
      '.dsbal-hdr:hover { background: var(--dsw-alias-interactive-bg-hover); }',
      '.dsbal-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--dsw-static-deepseek-450); flex: none; }',
      '.dsbal-amount { font-weight: 600; }',
      '.dsbal-low .dsbal-amount { color: var(--dsw-alias-state-warn-label); }',
      '.dsbal-muted { color: var(--dsw-alias-label-dimmed); }',
      '.dsbal-err { color: var(--dsw-alias-state-error-secondary); }',
    ].join('\n')

    /** Map the API currency code to a display symbol. */
    function symbol(currency) {
      if (currency === 'CNY') return '¥'
      if (currency === 'USD') return '$'
      return ''
    }

    /** Query the Host route; resolves the parsed JSON payload. */
    function fetchBalance() {
      return window.fetch('/api/dsh/deepseek-balance', { headers: { accept: 'application/json' } })
        .then((res) => res.json())
        .catch((err) => ({ ok: false, error: String(err && err.message ? err.message : err) }))
    }

    /** Auto-refresh cadence: 5 minutes, silent (no loading flicker). */
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000

    /** The header utilities capsule next to the Session log export button. */
    function BalanceHeader() {
      const [state, setState] = React.useState({ status: 'loading' })

      const load = (force) => {
        if (force !== true) setState({ status: 'loading' })
        fetchBalance().then((res) => {
          if (res && res.ok === true && res.balance) {
            setState({ status: 'ok', balance: res.balance })
          } else {
            setState({ status: 'error', message: res && res.error ? res.error : '未知错误' })
          }
        })
      }

      React.useEffect(() => {
        load(false)
        const timer = setInterval(() => { load(true) }, REFRESH_INTERVAL_MS)
        return () => clearInterval(timer)
      }, [])

      let cls = 'dsbal-hdr'
      let inner = null
      let title = 'DeepSeek 余额（点击刷新）'

      if (state.status === 'loading') {
        inner = React.createElement('span', { className: 'dsbal-muted' }, '余额 …')
        title = '正在查询 DeepSeek 余额'
      } else if (state.status === 'error') {
        cls += ' dsbal-err'
        inner = React.createElement('span', null, '余额查询失败')
        title = 'DeepSeek 余额查询失败：' + state.message
      } else {
        const b = state.balance
        const sym = symbol(b.currency)
        const totalNum = Number(b.total)
        if (Number.isFinite(totalNum) && totalNum <= 10) cls += ' dsbal-low'
        title = 'DeepSeek 余额（点击刷新）\n总额: ' + sym + b.total + '\n赠送: ' + sym + b.granted + '\n充值: ' + sym + b.toppedUp + '\n状态: ' + (b.isAvailable ? '可用' : '不可用')
        inner = [
          React.createElement('span', { className: 'dsbal-dot', key: 'dot' }),
          React.createElement('span', { key: 'label' }, '余额 '),
          React.createElement('span', { className: 'dsbal-amount', key: 'amount' }, sym + b.total),
        ]
      }

      return React.createElement('button', {
        type: 'button',
        className: cls,
        title,
        onClick: () => { load(true) },
      }, inner)
    }

    /** Browser-half entry: register the capsule into the header utilities row. */
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return

      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-deepseek-balance'
      tag.textContent = CSS
      document.head.append(tag)
      ctx.effect(() => () => { tag.remove() }, 'dsh-deepseek-balance: styles')

      slots.inject('conversation.session.header.utilities', () => slots.register(
        { name: 'conversation.session.header.utilities', id: 'deepseek-balance', order: 100, label: 'DeepSeek 余额' },
        BalanceHeader,
      ))
    }

    exports.apply = apply
    return module.exports
  },
})
