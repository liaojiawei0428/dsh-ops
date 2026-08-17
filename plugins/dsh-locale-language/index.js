/**
 * dsh-locale-language — a zero-dependency host plugin.
 *
 * Registers a GLOBAL system-prompt section (order -50, before the deployment
 * persona) and a runtime context that both carry one instruction: think
 * (chain of thought) and reply in the language of the DSH UI locale.
 *
 * The locale is read live at every prompt assembly from the host settings
 * namespace `locale` (preference `zh` | `en`), so switching the UI language
 * takes effect on the next model request — no restart needed. When no
 * explicit preference is stored, FALLBACK_LOCALE is used.
 */

/** Language used when the UI locale preference is absent. */
const FALLBACK_LOCALE = 'zh'

/** Instruction text per locale id. */
const TEXT = {
  zh: 'DSH 界面语言为简体中文。请始终使用简体中文进行思考（思维链）和回复，除非用户明确要求使用其他语言。',
  en: 'The DSH interface language is English. Always think (chain of thought) and reply in English, unless the user explicitly asks for another language.',
}

/**
 * Resolve the active UI locale as the host knows it.
 * @param ctx - the mounting Cordis context.
 * @returns `'zh'` or `'en'`.
 */
function activeLocale(ctx) {
  try {
    const section = ctx.settings?.get?.('locale')
    const preference = section?.preference
    if (preference === 'en' || preference === 'zh') return preference
    return FALLBACK_LOCALE
  } catch {
    return FALLBACK_LOCALE
  }
}

/** Cordis plugin name. */
export const name = 'locale-language'

/** Required services. */
export const inject = ['systemPrompt']

/**
 * Mount the locale-language prompt contributions.
 * @param ctx - a context with the systemPrompt service.
 */
export function apply(ctx) {
  const text = () => TEXT[activeLocale(ctx)]
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'locale:language',
    order: -50,
    text,
  }), 'locale-language: section')
  ctx.effect(() => ctx.systemPrompt.context({
    name: 'locale:language',
    order: 10,
    text,
  }), 'locale-language: context')
}
