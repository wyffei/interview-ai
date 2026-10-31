import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  SendHorizontal,
  X
} from 'lucide-react'
import {
  useSolutionStore,
  type PastQuestion,
  type ReasoningRound,
  type RoundUi
} from '@/lib/store/solution'
import { answerLabel, questionNumber, questionTitle } from '../../../shared/screenshot'
import { useModePage } from '@/lib/use-main-page'
import { cn } from '@/lib/utils'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { AppHeader } from '@/components/AppHeader'

/** What one page of scrolling keeps of the previous page, so the eye finds its place */
const PAGE_OVERLAP = 120

/**
 * 截图模式: the screenshots taken from the toolbar and the model's answer about
 * them, with a box for follow-up questions. Main owns the conversation (see
 * main screenshot.ts); the answer is followed into the store by App, so it
 * survives a visit to the settings.
 */
export default function ScreenshotPage() {
  useModePage('screenshot')

  return (
    <div className="screenshot-page flex h-screen flex-col">
      <AppHeader mode="screenshot" />
      <AnswerPanel />
      <FollowUpInput />
    </div>
  )
}

function AnswerPanel() {
  const {
    screenshots,
    screenshotTotal,
    solutionChunks,
    reasoningRounds,
    liveRound,
    roundUi,
    isLoading,
    capturing,
    errorMessage,
    questionId,
    history,
    setRoundOpen,
    setErrorMessage
  } = useSolutionStore()
  const panelRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLDivElement>(null)

  // A new question goes to the top of the panel, past the history rows above it
  useEffect(() => {
    if (questionId) currentRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [questionId])

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const scroll = (direction: 1 | -1) => () => {
      panel.scrollTo({
        top: panel.scrollTop + direction * Math.max(panel.clientHeight - PAGE_OVERLAP, 40),
        behavior: 'smooth'
      })
    }
    window.api.onScrollPageUp(scroll(-1))
    window.api.onScrollPageDown(scroll(1))
    return () => {
      window.api.removeScrollPageUpListener()
      window.api.removeScrollPageDownListener()
    }
  }, [])

  // Stable between chunks, so the memoized renderer skips the renders caused by
  // the rest of the store (loading flag, errors)
  const solutionText = useMemo(() => solutionChunks.join(''), [solutionChunks])
  // The record comes once the answer is done; the answer may name it sooner
  const currentSummary = useSolutionStore((state) => state.summaries[questionId])
  const currentNumber =
    currentSummary?.number || questionNumber(solutionText, currentSummary?.question)

  // One answer segment per round, cut at the snapshots taken when each round
  // began — right after main sent that round's `---` separator, so the
  // separator stays at the end of the previous segment
  const answerSegments = useMemo(
    () =>
      reasoningRounds.map((round, index) =>
        solutionText.slice(round.textStart, reasoningRounds[index + 1]?.textStart)
      ),
    [solutionText, reasoningRounds]
  )

  return (
    <div ref={panelRef} className="panel-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6">
      <WaitStatus
        answerStarted={solutionText.length > (reasoningRounds.at(-1)?.textStart ?? 0)}
        thinking={liveRound !== null}
      />
      {history.map((question) => (
        <PastQuestionRow key={question.id} question={question} />
      ))}
      {/* Below the sticky wait line when scrolled to */}
      <div ref={currentRef} className="scroll-mt-10" />
      {history.length > 0 && questionId > 0 && (
        <p className="mb-2 text-xs font-medium text-app-muted-fg select-none">
          {questionTitle(currentNumber, questionId)}
        </p>
      )}
      {errorMessage && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-500/20 p-2 text-sm text-red-300">
          <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
          <button
            className="shrink-0 text-red-400/80 hover:text-red-300 cursor-pointer"
            onClick={() => setErrorMessage(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {screenshots.length === 0 ? (
        !isLoading && !capturing && history.length === 0 && <EmptyTip />
      ) : (
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
          {screenshots.map((data, index) => (
            <img
              key={index}
              src={`data:image/png;base64,${data}`}
              alt=""
              className="h-auto w-36 shrink-0 rounded-md border border-app-border"
            />
          ))}
          {screenshotTotal > screenshots.length && (
            <span className="shrink-0 text-xs text-app-muted-fg">共 {screenshotTotal} 张</span>
          )}
        </div>
      )}

      {/* Answers interleave with their reasoning: 思考1 正文1 --- 思考2 正文2.
          Each round's block sits above that round's answer segment */}
      {reasoningRounds.map((round, index) => (
        <Fragment key={index}>
          <ReasoningBlock
            round={round}
            label={index === 0 ? '思考过程' : `思考过程 · ${index + 1}`}
            live={liveRound === index}
            answerStarted={solutionText.length > round.textStart}
            ui={roundUi[index]}
            onToggle={(open) => setRoundOpen(index, !open)}
          />
          <MarkdownRenderer>{answerSegments[index] ?? ''}</MarkdownRenderer>
        </Fragment>
      ))}
    </div>
  )
}

/**
 * The wait between a click and the first words of the answer, which nothing
 * else on the page shows: up to a second of capturing, then the model reading
 * the screenshot. Pinned to the top of the panel, so it is in view however far
 * down the previous answer was read, and counting seconds, so a slow model
 * does not look like a frozen app.
 */
function WaitStatus({ answerStarted, thinking }: { answerStarted: boolean; thinking: boolean }) {
  const capturing = useSolutionStore((state) => state.capturing)
  const isLoading = useSolutionStore((state) => state.isLoading)
  const fromCapture = useSolutionStore((state) => state.loadingAfterCapture)
  const active = capturing || (isLoading && !answerStarted)
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)

  // Counts from the click, through the capture and the model's first words
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    setStartedAt(start)
    setNow(start)
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null
  const seconds = Math.floor((now - startedAt) / 1000)
  const text = capturing
    ? '正在截图…'
    : `${fromCapture ? '已截图，' : ''}${thinking ? 'AI 正在思考…' : 'AI 正在看题…'}`

  return (
    <div className="sticky top-0 z-10 mb-3 flex w-fit items-center gap-1.5 rounded-full border border-app-border bg-[var(--app-surface-bg)] px-2.5 py-1 text-xs select-none">
      {capturing ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5 text-green-500" />
      )}
      <span>{text}</span>
      {!capturing && <span className="tabular-nums text-app-muted-fg">{seconds}s</span>}
    </div>
  )
}

/**
 * An earlier question, folded to one line: its number and its answer in short,
 * from the model's record when there is one, else read off the answer. A click
 * opens the whole answer.
 */
function PastQuestionRow({ question }: { question: PastQuestion }) {
  const [open, setOpen] = useState(false)
  const summary = useSolutionStore((state) => state.summaries[question.id])
  const label = summary?.answer || answerLabel(question.text)
  const number = summary?.number || questionNumber(question.text, summary?.question)

  return (
    <div className="mb-2 rounded-lg border border-app-border text-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-left select-none"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="shrink-0 font-medium">{questionTitle(number, question.id)}</span>
        {label && <span className="min-w-0 truncate">· 答案 {label}</span>}
        {summary?.reason && !open && (
          <span className="min-w-0 truncate text-app-muted-fg">{summary.reason}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-app-border px-3 py-2 text-sm">
          <MarkdownRenderer>{question.text}</MarkdownRenderer>
        </div>
      )}
    </div>
  )
}

function EmptyTip() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-app-muted-fg select-none">
      <Camera className="size-6 opacity-60" />
      <p>点上方工具条的「截图」，把屏幕上的题目发给 AI 解答</p>
      <p className="text-xs">
        题目一屏放不下就「追加截图」；只要一块区域用「框选截图」，每次都截同一块到「设置 →
        截图模式」设截图区域
      </p>
    </div>
  )
}

/**
 * One request round's reasoning, streamed above that round's answer. While the
 * model is reasoning the box holds a fixed three lines, the latest pushing up
 * from the bottom, so the stream never moves the layout around. Once the
 * answer starts the block folds to its header line; it reopens on a click,
 * and a click also stops it from following the stream again.
 */
function ReasoningBlock({
  round,
  label,
  live,
  answerStarted,
  ui,
  onToggle
}: {
  round: ReasoningRound
  label: string
  /** Chunks are still arriving for this round */
  live: boolean
  /** This round's answer text has started below it */
  answerStarted: boolean
  /** What the user chose for this round; absent until they click its header */
  ui: RoundUi | undefined
  /** Called with the state the block is currently in, so a click always flips it */
  onToggle: (open: boolean) => void
}) {
  const reasoningText = useMemo(() => round.chunks.join(''), [round.chunks])
  if (!reasoningText) return null

  const open = ui?.pinned ? ui.open : live && !answerStarted
  const streaming = open && live && !answerStarted

  return (
    <div className="mb-3 rounded-lg border border-app-border">
      <button
        type="button"
        onClick={() => onToggle(open)}
        className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs text-app-muted-fg select-none"
      >
        <Brain className="size-3.5" />
        <span>{label}</span>
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className={cn(
            'px-3 pb-2 text-xs break-words opacity-80',
            // Fixed height while reasoning streams: three lines plus the bottom
            // padding, so no line is cut in half. A bounded scroll once done
            streaming
              ? 'flex h-[calc(3lh+0.5rem)] flex-col justify-end overflow-hidden'
              : 'max-h-64 overflow-y-auto'
          )}
        >
          <MarkdownRenderer compact>{reasoningText}</MarkdownRenderer>
        </div>
      )}
    </div>
  )
}

/** A follow-up question about the screenshots on screen; Enter sends it */
function FollowUpInput() {
  const [question, setQuestion] = useState('')
  const hasAnswer = useSolutionStore((state) => state.screenshots.length > 0)
  const isLoading = useSolutionStore((state) => state.isLoading)

  const submit = () => {
    const text = question.trim()
    if (!text || !hasAnswer) return
    setQuestion('')
    void window.api.sendFollowUpQuestion(text)
  }

  return (
    <div className="flex shrink-0 items-start gap-2 border-t border-app-border px-3 py-2">
      <textarea
        rows={2}
        className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-app-muted-fg"
        value={question}
        disabled={!hasAnswer}
        placeholder={
          hasAnswer
            ? '追问：比如「换一种解法」「超时了，n 最大 10^5」，回车发送，Shift+回车换行'
            : '截图后可在这里追问'
        }
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      {isLoading ? (
        <button
          className="shrink-0 pt-0.5 text-xs text-app-muted-fg hover:text-current cursor-pointer"
          onClick={() => void window.api.stopScreenshotAnswer()}
        >
          停止
        </button>
      ) : (
        question.trim() && (
          <button
            className="shrink-0 pt-0.5 text-app-muted-fg hover:text-current cursor-pointer"
            aria-label="发送追问"
            onClick={submit}
          >
            <SendHorizontal className="size-4" />
          </button>
        )
      )}
    </div>
  )
}
