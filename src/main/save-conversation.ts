import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { settings } from './settings'
import { NO_REPLY, isMine, type HintCard, type Utterance } from '../shared/conversation'
import type { Briefing } from '../shared/briefing'

/**
 * The conversation's record on disk: one Markdown file per conversation, named after
 * when it began and rewritten whole as it grows, so the file always holds the
 * entire conversation so far.
 */

export interface ConversationRecord {
  /** When the first sentence was heard; the file is named after it */
  startedAt: number
  utterances: Utterance[]
  hints: HintCard[]
  /** The interview's 面试准备: target company, JD and 行业卡片 */
  briefing?: Briefing
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Where the records go, the conversations' and 截图模式's alike; blank means Documents/InterviewCoder */
export function getSaveDir(): string {
  return settings.conversationSaveDir || join(app.getPath('documents'), 'InterviewCoder')
}

function fileName(startedAt: number): string {
  const d = new Date(startedAt)
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `对话记录_${date}_${time}.md`
}

function title(startedAt: number): string {
  const d = new Date(startedAt)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `# 对话记录 ${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function hintLabel(card: HintCard): string {
  if (card.status === 'stopped') return '**提示**（已停止）'
  if (card.status === 'streaming') return '**提示**（未写完）'
  return '**提示**'
}

/**
 * What the interview was prepared with, ahead of the conversation. A card still
 * being written is left out; the next save after it finishes has it
 */
function formatBriefing(briefing: Briefing | undefined): string {
  if (!briefing) return ''
  const card = briefing.status === 'streaming' ? '' : briefing.card.trim()
  const parts: string[] = []
  if (briefing.company || briefing.jd.trim()) {
    parts.push('## 目标岗位')
    if (briefing.company) parts.push(`**公司**：${briefing.company}`)
    if (briefing.jd.trim()) parts.push('**岗位 JD**', briefing.jd.trim())
  }
  if (card) {
    const source = [briefing.model, briefing.searched ? '联网搜索' : '未联网']
      .filter(Boolean)
      .join(' · ')
    // One level down, under the section's own heading
    parts.push('## 行业卡片', `*${source}*`, card.replace(/^(#{1,5}) /gm, '#$1 '))
  }
  if (briefing.introStatus === 'done' && briefing.intro.trim()) {
    parts.push('## 自我介绍', briefing.intro.trim())
  }
  return parts.join('\n\n')
}

/**
 * The conversation as rounds: what the other side said, as a quote, then the
 * hint written for it. Hints with nothing to keep (failed, withdrawn,
 * 「（无需回应）」) are left out, and the sentences they covered join the next
 * round. Null when nothing has been said yet.
 */
export function formatConversation({
  startedAt,
  utterances,
  hints,
  briefing
}: ConversationRecord): string | null {
  const spoken = utterances.filter((u) => u.text.trim())
  const shown = hints
    .filter((card) => {
      const text = card.text.trim()
      return card.status !== 'waiting' && card.status !== 'error' && text && text !== NO_REPLY
    })
    .sort((a, b) => a.toId - b.toId)
  if (spoken.length === 0 && shown.length === 0) return null

  const rounds: string[] = []
  let heard: Utterance[] = []
  const closeRound = (card?: HintCard) => {
    const parts: string[] = []
    // Consecutive sentences of one speaker share a quote (手机面试模式 hears both)
    heard.forEach((utterance, i) => {
      // A sentence is one line from the recogniser; a stray line break would end the quote
      const line = `> ${utterance.text.trim().replace(/\s*\n\s*/g, ' ')}`
      if (i > 0 && isMine(heard[i - 1]) === isMine(utterance)) {
        parts[parts.length - 1] += `\n>\n${line}`
      } else {
        parts.push(isMine(utterance) ? '**我**' : '**对方**', line)
      }
    })
    if (card) parts.push(hintLabel(card), card.text.trim())
    rounds.push(parts.join('\n\n'))
    heard = []
  }

  let next = 0
  for (const utterance of spoken) {
    while (next < shown.length && shown[next].toId < utterance.id) closeRound(shown[next++])
    heard.push(utterance)
  }
  while (next < shown.length) closeRound(shown[next++])
  if (heard.length > 0) closeRound()

  const prepared = formatBriefing(briefing)
  const conversation = rounds.join('\n\n---\n\n')
  // With the preparation ahead of it, the conversation gets a heading of its own
  const body = prepared ? `${prepared}\n\n## 对话\n\n${conversation}` : conversation
  return `${title(startedAt)}\n\n${body}\n`
}

/** Writes in the order they were asked for, so an older record never lands over a newer one */
let queue: Promise<void> = Promise.resolve()

/**
 * Write the record to the configured folder. The content is taken at once, so
 * the conversation may change (or be cleared) while the write is queued.
 */
export function saveConversation(record: ConversationRecord): Promise<void> {
  const content = formatConversation(record)
  if (!content) return Promise.resolve()
  const dir = getSaveDir()
  const filePath = join(dir, fileName(record.startedAt))
  const write = queue.then(async () => {
    await mkdir(dir, { recursive: true })
    await writeFile(filePath, content, 'utf8')
  })
  queue = write.catch(() => {})
  return write
}

/** The same, for when the app is quitting and cannot wait for a promise */
export function saveConversationSync(record: ConversationRecord): void {
  const content = formatConversation(record)
  if (!content) return
  const dir = getSaveDir()
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, fileName(record.startedAt)), content, 'utf8')
  } catch (error) {
    console.error('Failed to save the conversation:', error)
  }
}
