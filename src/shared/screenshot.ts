/**
 * 截图模式's record of a question: what it asked, read off the screenshots,
 * and the answer in short. The model appends it to its answer between
 * `RECORD_OPEN` and `RECORD_CLOSE` (main screenshot.ts), kept off the page,
 * for the file on disk and the page's history.
 */

export const RECORD_OPEN = '<记录>'
export const RECORD_CLOSE = '</记录>'

/**
 * How much of a streaming answer may be shown: everything before the record.
 * The tail that could be the start of `RECORD_OPEN` (`<`, `<记`) is held back
 * until the next chunk tells.
 */
export function visibleLength(text: string): number {
  const open = text.indexOf(RECORD_OPEN)
  if (open !== -1) return open
  for (let keep = Math.min(RECORD_OPEN.length - 1, text.length); keep > 0; keep--) {
    if (RECORD_OPEN.startsWith(text.slice(-keep))) return text.length - keep
  }
  return text.length
}

/**
 * A finished answer cut at its record: the answer as shown (and kept in the
 * history the model sees), and the record's JSON, null when the model left it
 * out. A fence or rule the model opened for the record is left out of the answer.
 */
export function splitRecord(text: string): { answer: string; record: string | null } {
  const open = text.indexOf(RECORD_OPEN)
  if (open === -1) return { answer: text.trim(), record: null }
  const rest = text.slice(open + RECORD_OPEN.length)
  const close = rest.indexOf(RECORD_CLOSE)
  const answer = text
    .slice(0, open)
    .replace(/\s*(?:```\w*|-{3,})\s*$/, '')
    .trim()
  return { answer, record: close === -1 ? rest : rest.slice(0, close) }
}
export interface ScreenshotSummary {
  /** The question's number as on screen (`37`, `3-5`); blank when it shows none */
  number: string
  /** The question as on screen, options included */
  question: string
  /** The final answer in short: `B`, `ACD`, `正确`, or a few words */
  answer: string
  /** Why, in a sentence */
  reason: string
}

/**
 * Models copying out a multi-line question often put its line breaks into the
 * JSON string as they are, which JSON does not allow; escape them there.
 */
function escapeRawControls(json: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < json.length; i++) {
    const char = json[i]
    if (inString && char === '\\') {
      out += char + (json[++i] ?? '')
      continue
    }
    if (char === '"') inString = !inString
    if (inString && char === '\n') out += '\\n'
    else if (inString && char === '\r') out += '\\r'
    else if (inString && char === '\t') out += '\\t'
    else out += char
  }
  return out
}

/**
 * The summary in the model's reply: a JSON object, maybe fenced or with words
 * around it. Null when there is none to be had.
 */
export function parseSummary(reply: string): ScreenshotSummary | null {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const value = JSON.parse(escapeRawControls(reply.slice(start, end + 1))) as Record<
      string,
      unknown
    >
    const field = (key: string) =>
      typeof value[key] === 'string' || typeof value[key] === 'number'
        ? String(value[key]).trim()
        : ''
    const summary = {
      number: field('number').replace(/^第\s*|\s*题$/g, ''),
      question: field('question'),
      answer: field('answer'),
      reason: field('reason')
    }
    return summary.question || summary.answer ? summary : null
  } catch {
    return null
  }
}

/**
 * The question's number as on screen, for a question whose record has none:
 * 「第 37 题」 in the answer, else a number heading the question read off the
 * screenshot (`37.`, `37、`). Blank when neither shows one.
 */
export function questionNumber(answer: string, question = ''): string {
  const inAnswer = answer.match(/第\s*(\d+(?:\s*[-~～—至]\s*\d+)?)\s*题/)
  if (inAnswer) return inAnswer[1].replace(/\s+/g, '')
  const heading = question.match(/^\s*(\d+)\s*[.、．)）]/)
  return heading ? heading[1] : ''
}

/**
 * A question's title in the history and the file: its number on screen, else
 * its place in this launch (`#2`), which is not to be mistaken for one
 */
export function questionTitle(number: string, id: number): string {
  return number ? `第 ${number} 题` : `#${id}`
}

/** How long a history row's answer may get before it is cut */
const LABEL_CHARS = 24

/**
 * The answer in a few characters, read off the answer text itself, for a
 * history row whose summary is not there (yet): the first 「答案：B」, else the
 * first line with its Markdown taken off.
 */
export function answerLabel(text: string): string {
  const choice = text.match(
    /答案\s*(?:是|为)?\s*[：:]?\s*\**\s*([A-H](?:\s*[、,，]?\s*[A-H])*|正确|错误)/
  )
  if (choice) return choice[1].replace(/[\s、,，]/g, '')
  const line = text
    .split('\n')
    .map((l) => l.replace(/[#>*`_|-]/g, '').trim())
    .find(Boolean)
  if (!line) return ''
  return line.length > LABEL_CHARS ? `${line.slice(0, LABEL_CHARS)}…` : line
}
