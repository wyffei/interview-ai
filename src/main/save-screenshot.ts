import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSaveDir } from './save-conversation'
import { questionNumber, questionTitle, type ScreenshotSummary } from '../shared/screenshot'

/**
 * 截图模式's record on disk: one Markdown file per app launch, named after
 * its first question and rewritten whole as questions are added, next to the
 * conversation records. Only text: the question is read off the screenshots
 * by the model, so the images themselves are not kept.
 */

export interface SavedQuestion {
  /** Numbered from 1 per launch; the title when the screenshot shows no number */
  id: number
  summary: ScreenshotSummary | null
  /** The whole answer, for when the summary could not be made */
  answer: string
}

const pad = (n: number) => String(n).padStart(2, '0')

function fileName(startedAt: number): string {
  const d = new Date(startedAt)
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `截图答题_${date}_${time}.md`
}

function title(startedAt: number): string {
  const d = new Date(startedAt)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `# 截图答题 ${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const quote = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')

function formatQuestion({ id, summary, answer }: SavedQuestion): string {
  const number = summary?.number || questionNumber(answer, summary?.question)
  const parts = [`## ${questionTitle(number, id)}`]
  if (summary) {
    if (summary.question) parts.push('**题目**', quote(summary.question))
    if (summary.answer) parts.push(`**答案**：${summary.answer}`)
    if (summary.reason) parts.push(`**理由**：${summary.reason}`)
  } else {
    parts.push('*（题目未能识别，下面是完整解答）*', answer.trim())
  }
  return parts.join('\n\n')
}

export function formatScreenshotRecord(startedAt: number, questions: SavedQuestion[]): string {
  return `${title(startedAt)}\n\n${questions.map(formatQuestion).join('\n\n---\n\n')}\n`
}

/** Writes in the order they were asked for, so an older record never lands over a newer one */
let queue: Promise<void> = Promise.resolve()

export function saveScreenshotRecord(startedAt: number, questions: SavedQuestion[]): void {
  if (questions.length === 0) return
  const content = formatScreenshotRecord(startedAt, questions)
  const dir = getSaveDir()
  const filePath = join(dir, fileName(startedAt))
  queue = queue
    .then(async () => {
      await mkdir(dir, { recursive: true })
      await writeFile(filePath, content, 'utf8')
    })
    .catch((error) => console.error('Failed to save the screenshot answers:', error))
}
