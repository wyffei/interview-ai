/**
 * 面试准备: the target company and JD the user enters before an interview, and
 * the 行业卡片 researched from them. Shared by main (which owns it, see main
 * briefing.ts) and the renderer (which edits and shows it).
 */

export type BriefingStatus = 'idle' | 'streaming' | 'done' | 'stopped' | 'error'

export interface Briefing {
  company: string
  jd: string
  /** The 行业卡片, Markdown */
  card: string
  /** What the model reasoned before writing it; not saved */
  reasoning: string
  status: BriefingStatus
  error?: string
  /** The model that wrote the card */
  model?: string
  /** Whether the platform was asked to search the web, and did not refuse */
  searched?: boolean
  /** When the card was finished (or stopped), ms */
  updatedAt?: number
  /** How long writing it took, ms */
  durationMs?: number
  /**
   * The resume attached for interviews, as extracted text, and the file it came
   * from. Kept from one interview to the next; only the page's 移除 drops it
   */
  resume: string
  resumeName: string
  /** The self-introduction written from the resume, the JD and the card */
  intro: string
  introStatus: BriefingStatus
  introError?: string
  /** The user edited or wrote it by hand; a rewrite by the model replaces that */
  introEdited?: boolean
}

/** Longest self-introduction kept when the user edits it */
export const BRIEFING_INTRO_CHARS = 4000

/**
 * What the self-introduction must be like, unless the user rewrote it on the
 * 面试准备 page (`briefingIntroPrompt`; blank means this, so a better default
 * reaches everyone who never edited it)
 */
export const DEFAULT_INTRO_PROMPT = `- 第一人称、口语化，能直接念出口；
- 时长约 1–2 分钟（中文 350–450 字），分 3–4 段，不要标题和列表；
- 结构：基本情况（学校、专业、学历）→ 与岗位最相关的 2 段经历（做了什么、用了什么技术、结果和数据）→ 为什么想做这个行业、这家公司 → 一句收尾；
- 经历按 JD 的要求挑选和排序，点出它与行业卡片里的应用场景和难点对得上的地方；
- 只用简历和资料里有的经历和数据，不要编造；资料不足的地方宁可少说。`

/** What a streamed chunk adds to: the card's reasoning, the card, the self-introduction */
export type BriefingChunkKind = 'reasoning' | 'text' | 'intro'

/** How a card would be researched now, for the page to show before it is asked for */
export interface BriefingRoute {
  model: string
  /** Searches the web */
  search: boolean
  /** The 百炼 key from the 语音 settings is used instead of the hint profile */
  dashscope: boolean
}

/** Longest JD and company name kept */
export const BRIEFING_JD_CHARS = 8000
export const BRIEFING_COMPANY_CHARS = 60

/** Whether the other side is asking for a self-introduction: the prepared one is shown as is */
export const INTRO_QUESTION = /自我介绍|介绍一下(你|您)?自己|介绍下(你|您)?自己|introduce yourself/i
