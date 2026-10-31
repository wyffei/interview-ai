import { useEffect, useRef, useState } from 'react'
import type { Briefing } from '../../../shared/briefing'

const nothing = () => ({ text: '', reasoning: '', intro: '' })

/**
 * Main's 面试准备 (see main briefing.ts), followed live: fetched on mount, then
 * kept current by its events. Null until the first fetch returns.
 */
export function useBriefing(): Briefing | null {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  // Chunks come one IPC message each; they reach the state once per frame
  const pending = useRef(nothing())
  const frame = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const flush = () => {
      frame.current = null
      const { text, reasoning, intro } = pending.current
      pending.current = nothing()
      setBriefing((b) =>
        b
          ? {
              ...b,
              card: b.card + text,
              reasoning: b.reasoning + reasoning,
              intro: b.intro + intro
            }
          : b
      )
    }
    window.api.getBriefing().then((b) => {
      if (alive) setBriefing(b)
    })
    const offUpdate = window.api.onBriefingUpdate((b) => {
      // Main's copy already holds every chunk sent before it
      pending.current = nothing()
      setBriefing(b)
    })
    const offChunk = window.api.onBriefingChunk((kind, delta) => {
      pending.current[kind === 'text' ? 'text' : kind] += delta
      frame.current ??= window.requestAnimationFrame(flush)
    })
    return () => {
      alive = false
      if (frame.current !== null) window.cancelAnimationFrame(frame.current)
      frame.current = null
      offUpdate()
      offChunk()
    }
  }, [])

  return briefing
}

/** 「3 分 20 秒」 */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}
