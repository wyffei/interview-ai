import { ipcMain, type BrowserWindow } from 'electron'
import type { ModelMessage } from 'ai'
import { takeScreenshot } from './take-screenshot'
import { pickCaptureRegion, pickScreenshot } from './region-picker'
import { getScreenshotStream } from './ai'
import { saveScreenshotRecord, type SavedQuestion } from './save-screenshot'
import {
  RECORD_CLOSE,
  RECORD_OPEN,
  parseSummary,
  splitRecord,
  visibleLength
} from '../shared/screenshot'
import { settings, getScreenshotProfile } from './settings'
import { state } from './state'
import { consumeStream, extractErrorMessage, isImageInputRefused } from './stream'
import type { StreamChunk } from './stream'
import type { CaptureRegion } from '../shared/capture-region'
import { updateToolbarStatus, type ScreenshotCapture } from './toolbar-window'

/**
 * 截图模式: a screenshot (or several) and the model's answer about it, plus
 * follow-up questions. Kept apart from the conversation in conversation.ts:
 * its own profile, scene prompt and history, and nothing heard is sent along.
 * Only the toolbar starts it; there are no shortcuts for these actions.
 */

/** Run `pick` with the main window out of the way; shortcuts.ts owns the window handling */
export type WhilePicking = <T>(mainWindow: BrowserWindow, pick: () => Promise<T>) => Promise<T>

type AbortReason = 'user' | 'new-request'

interface StreamContext {
  controller: AbortController
  reason: AbortReason | null
}

/** Thumbnails kept for the page; every screenshot still goes to the model */
const RECENT_SCREENSHOTS = 5

let currentStreamContext: StreamContext | null = null
/**
 * Bumped by every screenshot request and by stop. A capture takes up to a
 * second and Electron hands every request made meanwhile the same capture, so
 * only the newest request, if not stopped, goes on to ask the AI.
 */
let screenshotRequestId = 0

let conversationMessages: ModelMessage[] = []
let recentScreenshots: string[] = []
/** Every screenshot in the current conversation, including the ones dropped from the preview */
let screenshotCount = 0
let hasAppendSeparator = false

/** The question on screen, numbered from 1 per launch; a new screenshot starts the next */
let questionId = 0
/** This launch's questions as saved, in order; the file is rewritten from it */
const savedQuestions: SavedQuestion[] = []
/** When the first saved question began; the file is named after it */
let recordStartedAt = 0
/**
 * Asked for at the end of every system prompt while saving is on: the model
 * answers as the scene prompt says, then appends the question's record, which
 * `runAnswer()` keeps off the page. After the answer, so it is no slower; in
 * the same request, so the screenshots are sent once.
 */
const RECORD_INSTRUCTION = `## 答题记录（必须遵守）
按上面的要求回答完全部内容后，在最末尾另起一行输出本题的记录，格式严格如下，不要放进代码块，记录后面不要再写任何内容：
${RECORD_OPEN}{"number": "截图里这道题的题号，只写数字，如 37；多道题写首尾，如 3-5；截图里看不到题号就写空字符串", "question": "题目原文，按截图逐字识别，选择题包括全部选项；有多道题时依次列出", "answer": "最终答案。选择题只写选项字母，如 B 或 ACD；判断题写 正确 或 错误；其他题不超过 20 字。多道题按题号写，如 1.B 2.ACD", "reason": "简要理由，不超过 60 字"}${RECORD_CLOSE}
回答追问时同样附上记录，写这道题目前的最终结论。`

/** What goes after the scene prompt: a request's own note, then the record instruction */
function extraSystem(note?: string): string | undefined {
  return (
    [note, settings.screenshotAutoSave && RECORD_INSTRUCTION].filter(Boolean).join('\n\n') ||
    undefined
  )
}

/**
 * Keep the question's record, written by the model after its answer: in the
 * file and in the page's history. A later answer to the same question (an
 * appended screenshot, a follow-up) replaces it. Without a record (the model
 * left it out, or wrote no JSON) the whole answer is kept, so nothing answered
 * is lost.
 */
function recordQuestion(answer: string, record: string | null) {
  if (!settings.screenshotAutoSave) return
  const id = questionId
  const summary = record === null ? null : parseSummary(record)
  // The whole question's answers so far, for when there is no summary
  const answers = conversationMessages
    .filter((m) => m.role === 'assistant' && typeof m.content === 'string')
    .map((m) => m.content as string)
  const saved: SavedQuestion = { id, summary, answer: answers.join('\n\n---\n\n') || answer }
  const index = savedQuestions.findIndex((q) => q.id === id)
  if (index === -1) savedQuestions.push(saved)
  else savedQuestions[index] = saved
  if (!recordStartedAt) recordStartedAt = Date.now()
  saveScreenshotRecord(recordStartedAt, savedQuestions)
  const mainWindow = global.mainWindow
  if (summary && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('screenshot-summary', id, summary)
  }
}

/** How long the clicked button says 已截图 */
const CAPTURED_NOTICE_MS = 2000
let capturedTimer: NodeJS.Timeout | null = null

/**
 * A capture takes up to a second and the model's first words a few more, with
 * nothing on screen changing meanwhile; the button clicked and the page say
 * what is going on. `null` clears it (a capture that came to nothing).
 */
function showCapture(capture: ScreenshotCapture | null) {
  if (capturedTimer) clearTimeout(capturedTimer)
  capturedTimer = null
  updateToolbarStatus({ capture })
  // The page's flag runs on until the answer's loading takes over from it, in
  // the same update, so its wait line never blinks out in between
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('screenshot-capturing', capture !== null)
  }
  if (capture?.phase === 'captured') {
    capturedTimer = setTimeout(() => updateToolbarStatus({ capture: null }), CAPTURED_NOTICE_MS)
  }
}

function abortCurrentStream(reason: AbortReason) {
  if (!currentStreamContext) return
  currentStreamContext.reason = reason
  currentStreamContext.controller.abort()
}

/**
 * Start tracking a new answer, replacing whatever streams now. Called right
 * before streaming, after any awaited capture: a stream started during the
 * capture would otherwise go untracked, out of reach of later requests and of
 * the stop button, and write into the same answer.
 */
function beginStream(): StreamContext {
  abortCurrentStream('new-request')
  const streamContext: StreamContext = { controller: new AbortController(), reason: null }
  currentStreamContext = streamContext
  return streamContext
}

/** Stop the answer, and drop a screenshot still being captured for a new one */
export function stopAnswer(): boolean {
  screenshotRequestId++
  // A capture in progress is dropped; its button and the page stop saying so
  showCapture(null)
  if (!currentStreamContext) {
    // The answer a capture in progress replaced reported nothing; nothing streams now
    endLoading()
    return false
  }
  abortCurrentStream('user')
  return true
}

/**
 * An answer replaced by a new screenshot ends silently, so a request that then
 * comes to nothing (stopped, overtaken, a failed capture) ends the wait itself
 */
function endLoading() {
  const mainWindow = global.mainWindow
  if (currentStreamContext || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('ai-loading-end')
}

/** The screen could not be captured: say so instead of leaving the wait on screen */
function captureFailed() {
  showCapture(null)
  endLoading()
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(
    'solution-error',
    process.platform === 'darwin'
      ? '截图失败：请在「系统设置 → 隐私与安全性 → 屏幕录制」中允许本应用，然后重启应用'
      : '截图失败，请再试一次'
  )
}

function getPageWindow(): BrowserWindow | null {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inScreenshotPage) return null
  return mainWindow
}

/**
 * Explain why a request was not sent. The welcome dialog shows only once, so
 * a 截图模式 profile without a key would otherwise leave the button doing nothing.
 */
function screenshotProfileReady(mainWindow: BrowserWindow): boolean {
  if (getScreenshotProfile().apiKey.trim()) return true
  mainWindow.webContents.send(
    'solution-error',
    '截图模式使用的 AI 配置未填写 API Key，请到「设置 → 截图模式」选择或编辑配置'
  )
  return false
}

/**
 * Why a screenshot request failed, in the user's terms. A model that takes no
 * images is the likeliest mistake, since the profiles are shared with the
 * hints and a fast hint model is usually text only, so it is named outright.
 */
function describeAnswerError(error: unknown): string {
  const message = extractErrorMessage(error)
  if (!isImageInputRefused(error)) return message
  const profile = getScreenshotProfile()
  return `「${profile.name || profile.model}」的模型不支持图片输入，请到「设置 → 截图模式」换一个能识图的 AI 配置（${message}）`
}

/**
 * Stream an answer onto the page: reasoning chunks as `reasoning-chunk`,
 * answer chunks as `solution-chunk`, then `solution-complete`,
 * `solution-stopped` (stopped by the user) or `solution-error`. A stream
 * replaced by a newer request ends silently. `onComplete` gets the whole
 * answer, only when it finished on its own.
 *
 * The question's record the model appends (see `RECORD_INSTRUCTION`) never
 * reaches the page: answer text is sent only up to where it may begin, and
 * once complete the answer is cut at it, the answer going to `onComplete`
 * (and the history the model sees), the record to `recordQuestion()`.
 */
async function runAnswer(
  mainWindow: BrowserWindow,
  streamContext: StreamContext,
  createStream: (signal: AbortSignal) => AsyncIterable<StreamChunk>,
  onComplete: (answer: string) => void
): Promise<void> {
  const send = (channel: string, ...args: unknown[]) => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args)
  }
  let text = ''
  let shown = 0
  const showUpTo = (end: number) => {
    if (end > shown) send('solution-chunk', text.slice(shown, end))
    shown = Math.max(shown, end)
  }
  send('ai-loading-start')
  try {
    const outcome = await consumeStream(createStream, streamContext.controller, (chunk) => {
      if (chunk.kind === 'reasoning') return send('reasoning-chunk', chunk.delta)
      text += chunk.delta
      showUpTo(visibleLength(text))
    })
    if (outcome.status === 'aborted') {
      // Replaced by a newer request, which reports for itself
      if (streamContext.reason === 'user') send('solution-stopped')
    } else if (outcome.status === 'failed') {
      console.error('Error streaming screenshot answer:', outcome.error)
      send('solution-error', describeAnswerError(outcome.error))
    } else {
      const { answer, record } = splitRecord(outcome.text)
      // A held-back `<` that never became a record is part of the answer after all
      if (record === null) showUpTo(text.length)
      onComplete(answer)
      send('solution-complete')
      recordQuestion(answer, record)
    }
  } finally {
    if (currentStreamContext === streamContext) currentStreamContext = null
    // A newer request has started its own loading state already
    if (streamContext.reason !== 'new-request') send('ai-loading-end')
  }
}

function publishScreenshots(mainWindow: BrowserWindow) {
  mainWindow.webContents.send('screenshots-updated', recentScreenshots, screenshotCount)
}

/** Start a new conversation from one screenshot */
async function startScreenshotConversation(mainWindow: BrowserWindow, screenshotData: string) {
  conversationMessages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这是屏幕截图' },
        { type: 'image', image: screenshotData }
      ]
    }
  ]

  const streamContext = beginStream()
  recentScreenshots = [screenshotData]
  screenshotCount = 1
  hasAppendSeparator = false
  questionId++
  // The page folds the previous question into its history under its number
  mainWindow.webContents.send('solution-clear', questionId)
  publishScreenshots(mainWindow)
  await runAnswer(
    mainWindow,
    streamContext,
    (signal) => getScreenshotStream(conversationMessages, signal, extraSystem()),
    (answer) => {
      if (answer) conversationMessages.push({ role: 'assistant', content: answer })
    }
  )
}

/** 截图（新开对话）: capture the screen, or the capture region, and start over */
export async function newScreenshot(): Promise<void> {
  const mainWindow = getPageWindow()
  if (!mainWindow || !screenshotProfileReady(mainWindow)) return

  abortCurrentStream('new-request')
  const requestId = ++screenshotRequestId
  showCapture({ action: 'takeScreenshot', phase: 'capturing' })
  const screenshotData = await takeScreenshot()
  // Overtaken by a newer screenshot (which shows its own), or stopped, while capturing
  if (requestId !== screenshotRequestId) return
  if (!screenshotData || mainWindow.isDestroyed()) return captureFailed()
  showCapture({ action: 'takeScreenshot', phase: 'captured' })
  await startScreenshotConversation(mainWindow, screenshotData)
}

/** 追加截图: one more screenshot of the same question; the first one when there is none yet */
export async function appendScreenshot(): Promise<void> {
  const mainWindow = getPageWindow()
  if (!mainWindow || !screenshotProfileReady(mainWindow)) return
  if (conversationMessages.length === 0) return newScreenshot()

  abortCurrentStream('new-request')
  const requestId = ++screenshotRequestId
  showCapture({ action: 'appendScreenshot', phase: 'capturing' })
  const screenshotData = await takeScreenshot()
  if (requestId !== screenshotRequestId) return
  if (!screenshotData || mainWindow.isDestroyed()) return captureFailed()
  showCapture({ action: 'appendScreenshot', phase: 'captured' })

  conversationMessages.push({
    role: 'user',
    content: [
      {
        type: 'text',
        text: '这是下一部分截图，请结合之前所有截图和分析，继续分析解答，不要遗漏任何信息。'
      },
      { type: 'image', image: screenshotData }
    ]
  })

  const streamContext = beginStream()
  recentScreenshots = [...recentScreenshots, screenshotData].slice(-RECENT_SCREENSHOTS)
  screenshotCount += 1
  publishScreenshots(mainWindow)
  mainWindow.webContents.send('solution-chunk', hasAppendSeparator ? '\n\n' : '\n\n---\n\n')
  hasAppendSeparator = true
  // The appended screenshot gets its own reasoning, shown in its own block
  mainWindow.webContents.send('reasoning-round-start')
  await runAnswer(
    mainWindow,
    streamContext,
    (signal) =>
      getScreenshotStream(
        conversationMessages,
        signal,
        extraSystem('注意：如果有多张截图，请结合所有截图内容进行完整分析，不要遗漏任何部分。')
      ),
    (answer) => {
      if (answer) conversationMessages.push({ role: 'assistant', content: answer })
    }
  )
}

/**
 * 框选截图: drag out an area and get an answer about just that, leaving the
 * capture region alone. The window is out of the way while picking and shown
 * again for the answer; a cancelled pick leaves it as it was.
 */
export async function snipScreenshot(
  whilePicking: WhilePicking,
  reveal: (mainWindow: BrowserWindow) => void
): Promise<void> {
  const mainWindow = getPageWindow()
  if (!mainWindow || !screenshotProfileReady(mainWindow)) return

  const screenshotData = await whilePicking(mainWindow, pickScreenshot)
  if (!screenshotData || mainWindow.isDestroyed()) return
  // Cut from the frozen screen the user dragged on, so captured the moment the drag ends
  showCapture({ action: 'snipScreenshot', phase: 'captured' })
  reveal(mainWindow)
  // A screenshot still being captured from before the drag ended loses to this one
  screenshotRequestId++
  await startScreenshotConversation(mainWindow, screenshotData)
}

/**
 * 设置截图区域: drag out the area every later screenshot is cropped to, from
 * the toolbar or the settings page. It applies here at once, and goes to the
 * renderer too, whose store is what persists it.
 */
export async function pickRegion(whilePicking: WhilePicking): Promise<CaptureRegion | null> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return null
  const region = await whilePicking(mainWindow, () => pickCaptureRegion(settings.captureRegion))
  if (region) {
    settings.captureRegion = region
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('capture-region-picked', region)
  }
  return region
}

ipcMain.handle('screenshot:stop', () => stopAnswer())

ipcMain.handle('screenshot:follow-up', async (_event, question: string) => {
  const mainWindow = getPageWindow()
  if (!mainWindow) return false
  if (!screenshotProfileReady(mainWindow)) return false
  // Nothing to follow up on before the first screenshot
  if (conversationMessages.length === 0) return false

  const streamContext = beginStream()
  mainWindow.webContents.send('solution-chunk', '\n\n---\n\n')
  // The follow-up gets its own reasoning, shown in its own block
  mainWindow.webContents.send('reasoning-round-start')
  const asked: ModelMessage = { role: 'user', content: [{ type: 'text', text: question }] }

  await runAnswer(
    mainWindow,
    streamContext,
    (signal) => getScreenshotStream([...conversationMessages, asked], signal, extraSystem()),
    (answer) => {
      conversationMessages.push(asked)
      if (answer) conversationMessages.push({ role: 'assistant', content: answer })
    }
  )
  return true
})
