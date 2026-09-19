/**
 * dsh-personal-bar — browser half (client bundle).
 *
 * Owns exactly one thing: the personal-plugin capsule row below the composer
 * card. It registers one entry on the official `conversation.composer.dock`
 * slot and declares the additive child slot `dsh.personal.bar`, which every
 * personal plugin registers its own capsule into (server-ssh, github-push,
 * deepseek-balance).
 *
 * WHY THIS IS ITS OWN PLUGIN, not part of dsh-personal-hub:
 * `slots.inject(slot, cb)` runs cb only while that slot's declaration lives —
 * it is a reactive dependency, so a consumer whose supplier is absent is
 * skipped silently, with no error and no visible trace. While dsh-personal-hub
 * owned this row, disabling or breaking the settings-page plugin also removed
 * the Server-SSH, GitHub-push and DeepSeek-balance capsules from the composer
 * with nothing in the log to explain it. The container therefore lives in the
 * smallest possible plugin, one whose only job is to keep existing, so a fault
 * in any feature plugin cannot take the others' UI down with it.
 *
 * The row keeps the original `dsph-bar` class and rules so the rendered result
 * is byte-for-byte what personal-hub produced before the split.
 *
 * This file is a hand-written client bundle in the platform's module-loader
 * format: `window.__ModuleLoader__.load({ id, factory })`, with the factory's
 * `require` resolving platform seed words (react, …).
 */

window.__ModuleLoader__.load({
  id: 'dsh-personal-bar',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    /**
     * Official slot for entries below the composer card — where this row belongs,
     * and where it sat before the split too. Its host `.dock` is a nowrap flex
     * row shared with the shipped stats pills and ContextMeter, so this row takes
     * a line of its own through the CSS below rather than by relocating.
     */
    const HOST_SLOT = 'conversation.composer.dock'
    /** Additive child slot every personal plugin registers into. */
    const BAR_SLOT = 'dsh.personal.bar'

    const CSS = [
      // The host `.dock` (InputBar.module.css) is a flex row shared with the
      // shipped stats pills and ContextMeter. A local patch in
      // official-patches/apply-patches.mjs adds `flex-wrap: wrap` to `.dock`, so
      // this row — which asks for a full line — gets one of its own while the
      // shipped entries keep the line above. No parent selector is used: a
      // `:has()` rule was tried first and did not take effect in the user's
      // browser, so the container itself is patched instead.
      '.dsph-bar { order: 999; flex: 0 1 100%; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; max-width: var(--dsh-chat-content-width, 100%); margin: 0 auto; padding: 4px calc(var(--dsh-composer-side-clearance, 16px) + 16px) 0; box-sizing: border-box; }',
      '.dsph-bar:empty { display: none; }',
    ]

    /**
     * One horizontal row for every personal-plugin capsule. `renderSlot` is
     * the standard render share granted by declaring the child slot.
     * @param props - standard slot props (renderSlot face).
     * @returns the row element.
     */
    function PersonalBar(props) {
      return React.createElement(
        'div',
        { className: 'dsph-bar' },
        props.renderSlot(BAR_SLOT, {}),
      )
    }

    /**
     * Browser-half entry: own the capsule row and its child slot.
     * @param ctx - client plugin context.
     */
    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) {
        console.warn('[dsh-personal-bar] slots service unavailable despite inject declaration; row not registered')
        return
      }

      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-personal-bar'
      tag.textContent = CSS
      document.head.append(tag)
      ctx.effect(() => () => { tag.remove() }, 'dsh-personal-bar: styles')

      slots.inject(HOST_SLOT, () => slots.register({
        name: HOST_SLOT,
        id: 'personal-bar',
        order: 50,
        children: { [BAR_SLOT]: { kind: 'list', scope: 'session' } },
      }, PersonalBar))
    }

    exports.inject = ['slots']
    exports.apply = apply
    return module.exports
  },
})
