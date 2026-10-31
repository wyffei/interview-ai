/** Where requests go when a profile's API Base URL is left empty: OpenAI itself */
export const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1'

/**
 * One saved AI endpoint: everything needed to send a request. The renderer
 * keeps and edits the list; main asks for hints with the one picked for them.
 */
export interface ApiProfile {
  id: string
  /** User-facing label, e.g. 「DeepSeek 主力」 */
  name: string
  apiBaseURL: string
  apiKey: string
  /** Extra request headers some platforms need, one `Name: Value` per line */
  apiHeaders: string
  model: string
  /**
   * Ask the model to skip its thinking phase (see main thinking.ts). Kept per
   * profile because whether it helps, and how it is spelled, depends on the
   * platform and model — and so a fast profile and a careful one can sit side by side.
   */
  disableThinking: boolean
  /**
   * Ask a hybrid model to think, which it skips by default (百炼 qwen3-vl-plus).
   * Never set together with `disableThinking`; neither means the platform's default.
   */
  enableThinking: boolean
}

/** A profile's thinking switch in one value: neither field set is the platform's default */
export function thinkingModeOf(profile: Pick<ApiProfile, 'disableThinking' | 'enableThinking'>) {
  return profile.disableThinking ? 'off' : profile.enableThinking ? 'on' : 'default'
}
