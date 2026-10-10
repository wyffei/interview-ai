/**
 * 资料库: one piece of reference material the user brought (a resume, prepared
 * Q&A, notes). Main keeps the list and each text on disk, and puts the enabled
 * ones in front of the system prompt or searches them per question.
 */
export interface KnowledgeDoc {
  id: string
  name: string
  /** File name it was imported from; absent for pasted text */
  source?: string
  /** Full path of that file, for 「重新导入」 */
  sourcePath?: string
  chars: number
  /** Rough estimate, see `estimateTokens` */
  tokens: number
  /** Kept but not used; absent means it is used */
  disabled?: boolean
  /** How it is used; absent means `full` (docs saved before it existed) */
  use?: KnowledgeUse
  /**
   * For `search`: how many entries the 复盘库 search cut it into. Worked out
   * by main whenever it hands a doc over, never saved
   */
  sections?: number
  updatedAt: number
}

/**
 * - `full`: the whole text goes in front of every request (a resume, a JD)
 * - `search`: 复盘库 / 题库 — cut into entries by heading and searched per
 *   question (`src/shared/review-search.ts`): an entry that answers
 *   the very question is shown as is, without asking the model, and only the
 *   entries that fit go along with a hint
 */
export type KnowledgeUse = 'full' | 'search'

/** Imports longer than this start as `search`: sent in full they would slow every request down */
export const KNOWLEDGE_SEARCH_SUGGESTED_CHARS = 8000

export type KnowledgePatch = Partial<Pick<KnowledgeDoc, 'name' | 'disabled' | 'use'>> & {
  text?: string
}

export interface KnowledgeImportResult {
  added: KnowledgeDoc[]
  failed: { name: string; error: string }[]
}

/**
 * Above this many characters sent in full the settings page warns: answers get
 * slower and dearer, and small models run out of context. It is not enforced.
 */
export const KNOWLEDGE_CHAR_LIMIT = 30000

/** File types the importer reads */
export const KNOWLEDGE_EXTENSIONS = ['pdf', 'docx', 'md', 'markdown', 'txt']

const CJK = /[\u3000-\u303f\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/g

/**
 * Tokens `text` roughly costs: about 0.7 per Chinese character and one per 3.5
 * other characters, near what DeepSeek / Qwen / GPT tokenisers give
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0
  return Math.ceil(cjk * 0.7 + (text.length - cjk) / 3.5)
}
