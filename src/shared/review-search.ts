/**
 * 复盘库检索: a long piece of prepared interview material (Markdown with `#`
 * headings, which is what a .docx import becomes) cut into entries by heading,
 * and the entries that fit a question found without any model or network call.
 *
 * - Every heading starts an entry; so does a question line inside a section
 *   (「Q1：…」, a bold line ending in a question mark, or a short line ending in
 *   one) and a `问题？ | 回答` table row, since prepared answers are often
 *   written that way
 * - `matchTitles()` scores how well a question fits each entry's title. The
 *   question usually carries extra words (「先做个自我介绍吧」 for 「自我介绍」),
 *   so the title's coverage weighs more than the question's
 * - `rankRelated()` is BM25 over titles and bodies, for the material that goes
 *   along with a hint written by the model
 * - `lookupReview()` puts both together into a tier: show a prepared answer as
 *   is, have the model adapt the closest ones, or write from related material
 *
 * No imports: main uses it, and it can be run and tested on its own.
 */

export interface ReviewEntry {
  /** Headings above this entry, outermost first */
  path: string[]
  /** Its own heading, or the question line it starts with, without markup */
  title: string
  /**
   * The heading a question line opened right under (「### C++使用经验」 then
   * 「你没有用过C++，是吗？」): the question is matched by both
   */
  heading?: string
  body: string
  /** Heading level 1–6; 7 for a question line inside a section */
  level: number
  /** Whether the title can stand for an interview question */
  askable: boolean
  /** Position in its document */
  order: number
  docName: string
}

export interface ReviewIndex {
  entries: ReviewEntry[]
  /** Each entry's title (and `heading`) as question tokens and characters, for `matchTitles()` */
  titleForms: { tokens: Set<string>; chars: Set<string> }[][]
  /** Every token of each title, for the title bonus in `rankRelated()` */
  titleTerms: Set<string>[]
  /** Title + body term frequencies per entry, for BM25 */
  termFreqs: Map<string, number>[]
  lengths: number[]
  avgLength: number
  idf: Map<string, number>
}

export interface ReviewMatch {
  entry: ReviewEntry
  score: number
}

// ---------------------------------------------------------------- text

const HEADING = /^(#{1,6})\s+(.*)$/
const QUESTION_PREFIX = /^(?:Q\s*\d*|问题?\s*\d*|题目\s*\d*)\s*[:：、.．]\s*/i
const LIST_MARK = /^(?:[-*+•·]\s+|\d{1,2}\s*[.、．)）]\s*|[（(]\d{1,2}[)）]\s*|[√✓✔]\s*)/
const ENDS_WITH_QUESTION = /[?？][”"」』)）]*$/
const TABLE_QA = /^([^|]{2,80}?[?？])\s*\|\s*(.+)$/

/** Headings that organise the material rather than ask anything */
const GENERIC_TITLES = new Set([
  '复盘',
  '反问',
  '工作职责',
  '岗位职责',
  '任职要求',
  '一些其他问题',
  '其他问题',
  '其他基础知识',
  '其他',
  '总结',
  '笔记',
  '资料',
  '问题',
  '备注'
])
const SECTION_TITLE = /^第.{1,3}(?:组|部分|章|节|轮)/

/** Section names that do stand for a question, and the question they stand for */
const TITLE_QUESTIONS: Record<string, string> = {
  反问: '你还有什么问题想问我',
  反问环节: '你还有什么问题想问我'
}

function titleQuestion(title: string): string {
  return TITLE_QUESTIONS[title.replace(/[\s\p{P}\p{S}]/gu, '')] ?? title
}

/** Spoken padding that says nothing about which question it is */
const FILLER =
  /请你?|麻烦|能不能|可不可以|可以|简单地?|简要地?|详细地?|具体地?|大概|稍微|说说|讲讲|谈谈|聊聊|介绍一下|说一下|讲一下|谈一下|聊一下|一下|你觉得|你认为|你们|你的|你|我们|那么|然后|就是|好的|吧|呢|吗|啊|呀|嗯|哦/g
/** Ways to ask the same thing, folded together */
const QUESTION_WORDS = /什么样的?|什么|哪些|哪个|哪种|哪方面的?|怎么样|怎样|如何|怎么/g

function stripMarkup(line: string): string {
  return line
    .replace(/\*\*|__/g, '')
    .replace(/^#+\s*/, '')
    .trim()
}

function cleanTitle(line: string): string {
  let title = stripMarkup(line)
  // 「√ 1. Q1：…」: as many marks as there are
  for (let i = 0; i < 3; i++) {
    const next = title.replace(LIST_MARK, '').replace(QUESTION_PREFIX, '').trim()
    if (next === title) break
    title = next
  }
  return title
}

/** Latin words and numbers whole, Chinese as overlapping pairs */
export function tokenize(text: string): string[] {
  const s = text.normalize('NFKC').toLowerCase()
  const tokens: string[] = s.match(/[a-z0-9][a-z0-9+#.]*/g) ?? []
  // 「的」 joins words rather than belonging to one: 「ROS的通信」 has no 「的通」
  for (const run of s.replace(/的/g, ' ').match(/[\u4e00-\u9fff]+/g) ?? []) {
    if (run.length === 1) tokens.push(run)
    else for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2))
  }
  return tokens
}

/** A question or a title without its padding and question words */
function questionCore(text: string): string {
  return text.normalize('NFKC').replace(FILLER, ' ').replace(QUESTION_WORDS, ' ')
}

/** Tokens of a question or a title; single characters left by the stripping only when nothing else is */
export function questionTokens(text: string): string[] {
  const tokens = tokenize(questionCore(text))
  const longer = tokens.filter((t) => t.length > 1)
  if (longer.length > 0) return longer
  return tokens.length > 0 ? tokens : tokenize(text)
}

/** Characters too common to say which question it is */
const COMMON_CHARS = new Set('的是有我在了和对也都就要会能这那个们吗呢吧啊么去来到上下中为与及或被把')

/** Single characters of a question or a title, for wording in another order (「期望薪资」/「薪资期望」) */
export function questionChars(text: string): string[] {
  const core = questionCore(text).normalize('NFKC').toLowerCase()
  const chars = (core.match(/[\u4e00-\u9fff]/g) ?? []).filter((c) => !COMMON_CHARS.has(c))
  return [...chars, ...(core.match(/[a-z0-9][a-z0-9+#.]*/g) ?? [])]
}

function meaningfulLength(text: string): number {
  return text.replace(/[\s\p{P}\p{S}]/gu, '').length
}

function isQuestionLine(raw: string): boolean {
  const line = raw.trim()
  if (!line || line.length > 80) return false
  if (QUESTION_PREFIX.test(stripMarkup(line).replace(LIST_MARK, ''))) return true
  const plain = stripMarkup(line)
  if (!ENDS_WITH_QUESTION.test(plain) || meaningfulLength(plain) < 6) return false
  const bold = /^\*\*.+\*\*[?？]?$/.test(line)
  return bold || plain.length <= 40
}

function isAskable(title: string, level: number, minLevel: number): boolean {
  if (level < minLevel) return false
  if (meaningfulLength(title) < 2) return false
  const bare = title.replace(/[\s\p{P}\p{S}]/gu, '')
  if (bare in TITLE_QUESTIONS) return true
  return !GENERIC_TITLES.has(bare) && !SECTION_TITLE.test(bare)
}

// ---------------------------------------------------------------- parse

/** Cut one document into entries; containers with no text of their own are left out */
export function parseReviewDoc(text: string, docName: string): ReviewEntry[] {
  const lines = text.split('\n')
  // A document with second-level headings uses its first level for grouping
  // (a company, an interview round) rather than for questions
  const hasSubHeadings = lines.some((l) => /^#{2,6}\s/.test(l))
  const minLevel = hasSubHeadings ? 2 : 1

  const entries: ReviewEntry[] = []
  const stack: string[] = []
  let current: ReviewEntry = {
    path: [],
    title: docName,
    body: '',
    level: 0,
    askable: false,
    order: 0,
    docName
  }
  let order = 0

  const flush = () => {
    current.body = current.body.trim()
    if (current.body) entries.push(current)
  }

  for (const line of lines) {
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length
      const title = cleanTitle(heading[2])
      stack.length = level - 1
      const path = stack.filter(Boolean)
      stack[level - 1] = title
      current = {
        path,
        title,
        body: '',
        level,
        askable: isAskable(title, level, minLevel),
        order: ++order,
        docName
      }
      continue
    }
    // A question-and-answer table row (`问题？ | 回答`, as tables are imported): an entry of its own
    const row = TABLE_QA.exec(line.trim())
    if (row) {
      flush()
      const title = cleanTitle(row[1])
      const path = stack.filter(Boolean)
      entries.push({
        path,
        title,
        body: row[2].trim(),
        level: 7,
        askable: isAskable(title, 7, minLevel),
        order: ++order,
        docName
      })
      // Whatever follows the table belongs to the section again, not to this row
      current = { ...current, body: '', title: path.at(-1) ?? docName, askable: false }
      continue
    }
    if (isQuestionLine(line)) {
      // A heading with nothing of its own yet: the question is what it asks
      const opened = current.level >= 1 && current.level <= 6 && !current.body.trim()
      const heading = opened && current.askable ? current.title : undefined
      flush()
      const title = cleanTitle(line)
      current = {
        path: stack.filter(Boolean),
        title,
        ...(heading ? { heading } : {}),
        body: '',
        level: 7,
        askable: !!heading || isAskable(title, 7, minLevel),
        order: ++order,
        docName
      }
      continue
    }
    current.body += line + '\n'
  }
  flush()
  return entries
}

// ---------------------------------------------------------------- index

export function buildReviewIndex(entries: ReviewEntry[]): ReviewIndex {
  const termFreqs = entries.map((e) => {
    const tf = new Map<string, number>()
    for (const t of [...tokenize(e.title), ...tokenize(e.heading ?? ''), ...tokenize(e.body)]) {
      tf.set(t, (tf.get(t) ?? 0) + 1)
    }
    return tf
  })
  const lengths = termFreqs.map((tf) => [...tf.values()].reduce((a, b) => a + b, 0))
  const df = new Map<string, number>()
  for (const tf of termFreqs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const n = entries.length
  const idf = new Map<string, number>()
  for (const [t, c] of df) idf.set(t, Math.log(1 + (n - c + 0.5) / (c + 0.5)))
  return {
    entries,
    titleForms: entries.map((e) =>
      [e.title, e.heading].filter(Boolean).map((t) => {
        const question = titleQuestion(t as string)
        return {
          tokens: new Set(questionTokens(question)),
          chars: new Set(questionChars(question))
        }
      })
    ),
    titleTerms: entries.map((e) => new Set([...tokenize(e.title), ...tokenize(e.heading ?? '')])),
    termFreqs,
    lengths,
    avgLength: lengths.reduce((a, b) => a + b, 0) / Math.max(1, n),
    idf
  }
}

/** Scores this close count as a tie */
const TIE = 0.04

function coverage(of: Set<string>, by: Set<string>): number {
  if (of.size === 0) return 0
  let hit = 0
  for (const t of of) if (by.has(t)) hit++
  return hit / of.size
}

/** Mostly how much of the title the question contains, partly how much of the question the title accounts for */
function fit(title: Set<string>, question: Set<string>): number {
  return 0.7 * coverage(title, question) + 0.3 * coverage(question, title)
}

/**
 * How well `question` fits each askable entry's title, 0–1, best first; only
 * the best and those within reach of it. Prepared material often answers the
 * same question several times (a self-introduction per company), so more than
 * one entry can come back; among equals the later ones come first.
 */
export function matchTitles(index: ReviewIndex, question: string): ReviewMatch[] {
  const q = new Set(questionTokens(question))
  const qChars = new Set(questionChars(question))
  const scored: (ReviewMatch & { i: number })[] = []
  index.entries.forEach((entry, i) => {
    if (!entry.askable) return
    let score = 0
    for (const form of index.titleForms[i]) {
      // Same characters in another order count for a little less
      score = Math.max(score, fit(form.tokens, q), 0.85 * fit(form.chars, qChars))
    }
    scored.push({ entry, score, i })
  })
  if (scored.length === 0) return []
  const top = Math.max(...scored.map((s) => s.score))
  return scored
    .filter((s) => s.score >= top - TIE)
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .map(({ entry, score }) => ({ entry, score }))
}

/**
 * Entries by relevance to `question`, best first: BM25 over title and body,
 * plus each question term found in the title at its full weight, whatever the
 * section's length (a long 「ROS 项目」 section is still about ROS)
 */
export function rankRelated(index: ReviewIndex, question: string, limit: number): ReviewEntry[] {
  const k1 = 1.5
  const b = 0.75
  // Padding (「介绍一下」, 「什么」) is everywhere in interview material and would rank by it
  const terms = new Set(questionTokens(question))
  const scored: { i: number; score: number }[] = []
  index.termFreqs.forEach((tf, i) => {
    let score = 0
    for (const t of terms) {
      const f = tf.get(t)
      if (!f) continue
      const norm = 1 - b + (b * index.lengths[i]) / (index.avgLength || 1)
      const idf = index.idf.get(t) ?? 0
      score += (idf * f * (k1 + 1)) / (f + k1 * norm)
      if (index.titleTerms[i].has(t)) score += 2 * idf
    }
    if (score > 0) scored.push({ i, score })
  })
  scored.sort((x, y) => y.score - x.score)
  return scored.slice(0, limit).map(({ i }) => index.entries[i])
}

/** `百度 一面 › 复盘 › 末端误差3cm怎么保证？` */
export function entryLabel(entry: ReviewEntry): string {
  return [...entry.path, entry.title].join(' › ')
}

// ---------------------------------------------------------------- lookup

/**
 * - `direct`: one entry answers this very question; show its text as is
 * - `adapt`: close, or answered several ways; the model adapts those entries
 * - `none`: nothing prepared for it; the model writes from the related material
 */
export type ReviewTier = 'direct' | 'adapt' | 'none'

/** Title fit from which an entry counts as this very question */
export const DIRECT_SCORE = 0.8
/** Title fit from which an entry counts as a close question */
export const ADAPT_SCORE = 0.5
/** At most this many versions of one question go to the model */
const MAX_VERSIONS = 3

export interface ReviewLookup {
  tier: ReviewTier
  /** The prepared answers: one for `direct`, newest first for `adapt` */
  matches: ReviewMatch[]
  /** Other relevant material, best first, none of `matches` */
  related: ReviewEntry[]
}

/**
 * `hint` is what the user typed about the interview (「问的是 SLAM 项目」): it
 * steers the related material, but not the title match, where extra words
 * would only blur how well a title fits the question itself
 */
export function lookupReview(
  index: ReviewIndex,
  question: string,
  relatedLimit = 4,
  hint = ''
): ReviewLookup {
  const ties = matchTitles(index, question)
  const top = ties[0]
  let tier: ReviewTier = 'none'
  if (top && top.score >= DIRECT_SCORE && ties.length === 1) tier = 'direct'
  else if (top && top.score >= ADAPT_SCORE) tier = 'adapt'
  const matches = tier === 'none' ? [] : ties.slice(0, MAX_VERSIONS)
  const taken = new Set(matches.map((m) => m.entry))
  const related = rankRelated(index, `${question} ${hint}`, relatedLimit + taken.size)
    .filter((e) => !taken.has(e))
    .slice(0, relatedLimit)
  return { tier, matches, related }
}
