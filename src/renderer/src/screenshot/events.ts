import { useSolutionStore } from '@/lib/store/solution'

/**
 * Follow 截图模式's answer from main (screenshot.ts) into the solution store;
 * returns the unsubscribe.
 *
 * Each chunk arrives as its own IPC message, and writing it straight to the
 * store re-renders and re-parses the whole markdown answer once per chunk. A
 * fast model outruns that as the answer grows, so chunks are buffered until
 * the next animation frame: one parse per frame, however fast they come.
 * Reasoning chunks get their own buffer but share the frame.
 */
export function followScreenshotAnswer(): () => void {
  let pendingChunks: string[] = []
  let pendingReasoning: string[] = []
  let frameHandle: number | null = null
  const store = () => useSolutionStore.getState()

  const flush = () => {
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle)
      frameHandle = null
    }
    if (pendingChunks.length > 0) {
      store().addSolutionChunk(pendingChunks.join(''))
      pendingChunks = []
    }
    if (pendingReasoning.length > 0) {
      store().addReasoningChunk(pendingReasoning.join(''))
      pendingReasoning = []
    }
  }

  const discard = () => {
    if (frameHandle !== null) window.cancelAnimationFrame(frameHandle)
    frameHandle = null
    pendingChunks = []
    pendingReasoning = []
  }

  const schedule = () => {
    if (frameHandle === null) frameHandle = window.requestAnimationFrame(flush)
  }

  // Flushed at once when the stream ends rather than on a frame: a hidden
  // window may not paint one for a while, and the answer must be whole the
  // moment it is reported finished
  const end = () => {
    flush()
    store().setLiveRound(null)
  }

  const off = window.api.onScreenshotEvents({
    capturing: (capturing) => store().setCapturing(capturing),
    // Chunks still buffered belong to the answer moving into the history
    clear: (id) => {
      flush()
      store().clearSolution(id)
    },
    summary: (id, summary) => store().setSummary(id, summary),
    screenshots: (screenshots, total) => store().setScreenshots(screenshots, total),
    chunk: (chunk) => {
      pendingChunks.push(chunk)
      schedule()
    },
    // Lands in the last round, which `addReasoningChunk` marks as live
    reasoningChunk: (chunk) => {
      pendingReasoning.push(chunk)
      schedule()
    },
    // An appended screenshot or follow-up gets its own round: land any buffered
    // chunks in the previous round first, then open one whose answer text
    // starts at the current end of the text (just after the `---`)
    roundStart: () => {
      flush()
      store().startReasoningRound(store().solutionChunks.join('').length)
    },
    loading: (loading) => {
      store().setIsLoading(loading)
      if (loading) store().setErrorMessage(null)
    },
    complete: end,
    stopped: end,
    error: (message) => {
      end()
      store().setErrorMessage(message)
    }
  })

  return () => {
    discard()
    off()
  }
}
