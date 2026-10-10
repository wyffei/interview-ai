/**
 * The way the app is used: 对话模式 turns what the other side of a call says
 * into hints. 截图模式 has been removed; the type stays so material, profiles
 * and prompt scenes keep saying which mode they serve.
 */
export type AppMode = 'conversation'

/** Where requests go when a profile's API Base URL is left empty: OpenAI itself */
export const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1'

/**
 * One saved AI endpoint: everything needed to send a request. The renderer
 * keeps and edits the list; main sends hints with the one 对话模式 uses.
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
}
