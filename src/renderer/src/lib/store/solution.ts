import { create } from 'zustand'
import type { ScreenshotSummary } from '../../../../shared/screenshot'

/** One request round: its reasoning, and where its answer text begins */
export interface ReasoningRound {
  /** What the model reasoned in this round; empty for non-thinking models */
  chunks: string[]
  /**
   * Length of the answer text when this round began. Its answer segment is the
   * text from here to the next round's snapshot.
   */
  textStart: number
}

/** A round's collapse state, once the user has clicked its header */
export interface RoundUi {
  open: boolean
  pinned: boolean
}

interface SolutionState {
  /** From a screenshot click until its answer starts loading; nothing else on the page shows it */
  capturing: boolean
  isLoading: boolean
  /** The loading answer is for a screenshot just taken, not a follow-up question */
  loadingAfterCapture: boolean
  solutionChunks: string[]
  /**
   * Every request — the first screenshot, each appended screenshot, each
   * follow-up — gets a round, so reasoning and answer text stay paired no
   * matter which of the two the model produced. Round 0 exists from the moment
   * the answer is cleared; later rounds are opened by `reasoning-round-start`.
   * A round without reasoning shows no block but still owns its answer segment.
   */
  reasoningRounds: ReasoningRound[]
  /** The round reasoning chunks are currently landing in; null when none */
  liveRound: number | null
  /** Collapse state the user chose per round; rounds not here follow the stream */
  roundUi: Record<number, RoundUi>
  /** The latest few screenshots, as base64 PNG */
  screenshots: string[]
  /** Every screenshot sent to the AI, which can exceed the thumbnails kept around */
  screenshotTotal: number
  errorMessage: string | null
  /** The question on screen, numbered from 1 by main; 0 before the first */
  questionId: number
  /** Earlier questions of this launch, oldest first; only their answer text is kept */
  history: PastQuestion[]
  /** Each question's record, once main has made it (only when saving is on) */
  summaries: Record<number, ScreenshotSummary>
}

/** A question the page has moved on from, folded into one line */
export interface PastQuestion {
  id: number
  text: string
}

interface SolutionStore extends SolutionState {
  setCapturing: (capturing: boolean) => void
  setIsLoading: (isLoading: boolean) => void
  addSolutionChunk: (chunk: string) => void
  /** Append to the last round, which becomes the live one */
  addReasoningChunk: (chunk: string) => void
  /** Open a round for the next request, whose answer text starts at `textStart` */
  startReasoningRound: (textStart: number) => void
  setLiveRound: (index: number | null) => void
  /** The user clicked a round's header: pin it to the state they picked */
  setRoundOpen: (index: number, open: boolean) => void
  setScreenshots: (screenshots: string[], total: number) => void
  setErrorMessage: (message: string | null) => void
  /**
   * A new question, numbered `id`: screenshots, answer and reasoning start
   * over, and the question on screen, if it got an answer, joins the history
   */
  clearSolution: (id: number) => void
  setSummary: (id: number, summary: ScreenshotSummary) => void
}

export const useSolutionStore = create<SolutionStore>()((set) => ({
  capturing: false,
  isLoading: false,
  loadingAfterCapture: false,
  solutionChunks: [],
  reasoningRounds: [],
  liveRound: null,
  roundUi: {},
  screenshots: [],
  screenshotTotal: 0,
  errorMessage: null,
  questionId: 0,
  history: [],
  summaries: {},
  setCapturing: (capturing) => {
    set({ capturing })
  },
  setIsLoading: (isLoading) => {
    // Loading takes over from capturing in one update
    set((state) =>
      isLoading
        ? { isLoading, capturing: false, loadingAfterCapture: state.capturing }
        : { isLoading, loadingAfterCapture: false }
    )
  },
  addSolutionChunk: (chunk) => {
    set((state) => ({ solutionChunks: [...state.solutionChunks, chunk] }))
  },
  addReasoningChunk: (chunk) => {
    set((state) => {
      // A stream that somehow began without a clear still gets a round to land in
      const rounds =
        state.reasoningRounds.length > 0 ? state.reasoningRounds : [{ chunks: [], textStart: 0 }]
      const index = rounds.length - 1
      const last = rounds[index]
      return {
        reasoningRounds: [...rounds.slice(0, index), { ...last, chunks: [...last.chunks, chunk] }],
        liveRound: index
      }
    })
  },
  startReasoningRound: (textStart) => {
    set((state) => ({
      reasoningRounds: [...state.reasoningRounds, { chunks: [], textStart }],
      liveRound: null
    }))
  },
  setLiveRound: (index) => {
    set({ liveRound: index })
  },
  setRoundOpen: (index, open) => {
    set((state) => ({ roundUi: { ...state.roundUi, [index]: { open, pinned: true } } }))
  },
  setScreenshots: (screenshots, total) => {
    set({ screenshots, screenshotTotal: total })
  },
  setErrorMessage: (message) => {
    set({ errorMessage: message })
  },
  setSummary: (id, summary) => {
    set((state) => ({ summaries: { ...state.summaries, [id]: summary } }))
  },
  clearSolution: (id) => {
    // Round 0 opens so the text to come is paired with the reasoning to come
    set((state) => {
      const text = state.solutionChunks.join('').trim()
      return {
        questionId: id,
        history:
          state.questionId && text
            ? [...state.history, { id: state.questionId, text }]
            : state.history,
        solutionChunks: [],
        reasoningRounds: [{ chunks: [], textStart: 0 }],
        liveRound: null,
        roundUi: {},
        screenshots: [],
        screenshotTotal: 0,
        errorMessage: null
      }
    })
  }
}))
