/**
 * Asking the model to skip its thinking phase, or to think when it would not.
 *
 * The app shows a model's reasoning as it streams (see ai.ts), but the answer
 * itself still waits for it. Measured on an easy question, switching thinking
 * off took DeepSeek V4.1 Flash and GLM-4.5V from 4–28s to 1–2s before the
 * first character of the answer; models that do not think by default are
 * unaffected.
 *
 * The other way round, hybrid models such as 百炼's qwen3-vl-plus answer
 * without thinking unless asked, and a multiple-choice answer then commits to a
 * letter before any reasoning, which the reasoning after it may contradict.
 *
 * The OpenAI chat body has no standard field for this and every platform
 * spells it differently, so the fields are merged into the outgoing request
 * body by a fetch wrapper.
 */

/** Ask for thinking, or ask to skip it; a profile with neither sends the plain request */
export type ThinkingMode = 'on' | 'off'

/** Hosts whose own spelling applies to every model; mirrors renderer lib/providers.ts */
export const OPENROUTER_HOSTS = ['openrouter.ai']
const OPENAI_HOSTS = ['api.openai.com']

/**
 * What a platform says when it refuses one of the fields below, whatever the
 * wording: OpenAI's `Unknown parameter: 'enable_thinking'`, SiliconFlow's
 * `does not support parameter \`enable_thinking\``, OpenRouter's `Reasoning is
 * mandatory for this endpoint`. SiliconFlow names `enable_thinking` even when
 * only `thinking` was sent, so the match covers every spelling rather than just
 * the ones sent.
 */
const THINKING_FIELD_ERROR = /thinking|reasoning/i

/** The API Base URL's host; an empty URL means OpenAI itself (DEFAULT_API_BASE_URL) */
export function hostOf(baseURL: string): string {
  const url = baseURL.trim()
  if (!url) return OPENAI_HOSTS[0]
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function onHosts(host: string, hosts: string[]): boolean {
  return hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** The request-body fields that turn thinking off for this platform and model */
export function thinkingOffFields(baseURL: string, model: string): Record<string, unknown> {
  const host = hostOf(baseURL)
  // OpenRouter translates its own field for whichever model it routes to
  if (onHosts(host, OPENROUTER_HOSTS)) return { reasoning: { enabled: false } }
  // OpenAI rejects every field it does not know, so it gets only its own. A
  // proxy serving GPT models under their own names behaves the same
  if (onHosts(host, OPENAI_HOSTS) || /^(gpt-|o\d)/i.test(model)) {
    return { reasoning_effort: 'none' }
  }
  // DeepSeek, Zhipu and Doubao read `thinking`, Qwen reads `enable_thinking`,
  // and each ignores the other's, so both go along
  return { thinking: { type: 'disabled' }, enable_thinking: false }
}

/** The request-body fields that turn thinking on, spelled like `thinkingOffFields` */
export function thinkingOnFields(baseURL: string, model: string): Record<string, unknown> {
  const host = hostOf(baseURL)
  if (onHosts(host, OPENROUTER_HOSTS)) return { reasoning: { enabled: true } }
  if (onHosts(host, OPENAI_HOSTS) || /^(gpt-|o\d)/i.test(model)) {
    return { reasoning_effort: 'medium' }
  }
  return { thinking: { type: 'enabled' }, enable_thinking: true }
}

function thinkingFields(mode: ThinkingMode, baseURL: string, model: string) {
  return mode === 'on' ? thinkingOnFields(baseURL, model) : thinkingOffFields(baseURL, model)
}

/** Mode + platform + model triples that refused the fields; sent without them for the rest of the session */
const refused = new Set<string>()

/**
 * A fetch that adds the thinking fields to each chat request. A model that
 * refuses them — a thinking-only model refusing "off", a model that cannot
 * think refusing "on", or a platform that rejects unknown fields — gets the
 * request again without them, so the setting can slow a request down once but
 * never make it fail. `onRefused` fires on that first refusal only.
 */
export function createThinkingFetch(
  mode: ThinkingMode,
  baseURL: string,
  onRefused: (model: string, mode: ThinkingMode) => void
): typeof fetch {
  return async (input, init) => {
    let body: unknown
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    } catch {
      body = undefined
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fetch(input, init)

    const model = String((body as { model?: unknown }).model ?? '')
    const key = `${mode}\n${baseURL.trim()}\n${model}`
    if (refused.has(key)) return fetch(input, init)

    const response = await fetch(input, {
      ...init,
      body: JSON.stringify({ ...body, ...thinkingFields(mode, baseURL, model) })
    })
    if (response.status !== 400 && response.status !== 422) return response
    const detail = await response
      .clone()
      .text()
      .catch(() => '')
    if (!THINKING_FIELD_ERROR.test(detail)) return response

    refused.add(key)
    onRefused(model, mode)
    return fetch(input, init)
  }
}
