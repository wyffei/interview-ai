import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Mic, MicOff, PointerOff, UserRound, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  PHONE_MODE_ACTIONS,
  TOOLBAR_ACTIONS,
  type ToolbarAction,
  type ToolbarActionName
} from '@/lib/toolbar-actions'
import { WindowResizeHandles } from '@/components/WindowResizeHandles'
import { applyTheme } from '@/lib/theme'
import { useAppStore } from '@/lib/store/app'
import type { HintMode } from '@/lib/store/settings'
import type { Speaker } from '../../../shared/conversation'

/** Mirrors `.overlay-toolbar` in main.css: `p-2` around the buttons */
const BAR_PADDING = 8

type ToolbarStatus = {
  listening: boolean
  hintMode: HintMode
  phoneMode: boolean
  speaker: Speaker
}

const HINT_MODES: { value: HintMode; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'manual', label: '手动' }
]

/**
 * Toolbar rendered in its own always-on-top window above the main window.
 * Buttons carry no `title`: a native tooltip would be drawn outside the window
 * and would therefore not be covered by the window's content protection.
 */
export function OverlayToolbar() {
  const [hoverDelay, setHoverDelay] = useState(0)
  const [status, setStatus] = useState<ToolbarStatus>({
    listening: false,
    hintMode: 'auto',
    phoneMode: false,
    speaker: 'other'
  })
  const barRef = useRef<HTMLDivElement>(null)
  const syncAppState = useAppStore((state) => state.syncAppState)
  const ignoreMouse = useAppStore((state) => state.ignoreMouse)
  const actions = status.phoneMode
    ? TOOLBAR_ACTIONS
    : TOOLBAR_ACTIONS.filter(({ action }) => !PHONE_MODE_ACTIONS.has(action))
  const visibleCount = useVisibleActionCount(barRef, actions.length, [status, ignoreMouse])

  // Listening and the hint mode are owned by the main window; main relays them
  useEffect(() => {
    window.api.getToolbarStatus().then(setStatus)
    window.api.onSyncToolbarStatus(setStatus)
    return () => {
      window.api.removeSyncToolbarStatusListener()
    }
  }, [])

  // This window's store is its own copy, so the state main pushes has to be
  // relayed here; otherwise the toolbar's own buttons show stale state. The
  // page may have been reported before this window loaded, hence the fetch
  useEffect(() => {
    window.api.getAppState().then((state) => syncAppState(state))
    window.api.onSyncAppState((state) => syncAppState(state))
    return () => {
      window.api.removeSyncAppStateListener()
    }
  }, [syncAppState])

  // This window has its own settings store copy, so main pushes the live value.
  // The theme is left to App.tsx on load — this window shares localStorage with
  // the main window, and main's copy may still hold its startup default here.
  useEffect(() => {
    window.api.getAppSettings().then((settings) => {
      setHoverDelay(settings.toolbarHoverDelay || 0)
    })
    window.api.onSyncToolbarSettings(({ hoverDelay, theme }) => {
      setHoverDelay(hoverDelay || 0)
      applyTheme(theme)
    })
    return () => {
      window.api.removeSyncToolbarSettingsListener()
    }
  }, [])

  return (
    <div ref={barRef} className="overlay-toolbar overlay-toolbar-root">
      {actions.map((item, index) => (
        <ToolbarButton
          key={item.action}
          action={item.action}
          hoverDelay={hoverDelay}
          hidden={index >= visibleCount}
        >
          <ButtonContent item={item} status={status} ignoreMouse={ignoreMouse} />
        </ToolbarButton>
      ))}
      {/* Always on, width only: the height is the button row. main.css keeps
          these edges from ever showing a resize cursor. `nonActivating` because
          Windows eats this window's presses, see ToolbarButton below */}
      <WindowResizeHandles enabled axis="x" nonActivating />
    </div>
  )
}

/** Icon with its text beside it; listening, hint mode, speaker and click-through show their state */
function ButtonContent({
  item: { action, Icon, text },
  status,
  ignoreMouse
}: {
  item: ToolbarAction
  status: ToolbarStatus
  ignoreMouse: boolean
}) {
  if (action === 'toggleTranscription') {
    return status.listening ? (
      <>
        <Mic className="size-3.5 animate-pulse text-green-500" />
        停止监听
      </>
    ) : (
      <>
        <MicOff className="size-3.5 opacity-70" />
        开始监听
      </>
    )
  }
  if (action === 'toggleHintMode') {
    return (
      <span className="flex items-center rounded-md bg-app-chip p-0.5">
        {HINT_MODES.map(({ value, label }) => (
          <span
            key={value}
            className={cn(
              'rounded px-1.5 py-0.5',
              value === status.hintMode ? 'bg-[var(--app-hover-bg)]' : 'opacity-60'
            )}
          >
            {label}
          </span>
        ))}
      </span>
    )
  }
  if (action === 'toggleSpeaker') {
    return status.speaker === 'me' ? (
      <span className="flex items-center gap-1 text-amber-500">
        <UserRound className="size-3.5" />
        我在说
      </span>
    ) : (
      <>
        <UsersRound className="size-3.5" />
        对方在说
      </>
    )
  }
  if (action === 'ignoreOrEnableMouse' && ignoreMouse) {
    return (
      <>
        <PointerOff className="size-3.5" />
        取消穿透
      </>
    )
  }
  return (
    <>
      <Icon className="size-3.5" />
      {text}
    </>
  )
}

/**
 * Buttons keep their size when the toolbar window is resized; the ones that no
 * longer fit are hidden from the end, so a narrowed toolbar never shows a
 * sliver of a button. Hidden buttons keep their room (`visibility: hidden`), so
 * hiding them cannot feed back into the measurement. `deps` re-measures when a
 * button's text changes.
 */
function useVisibleActionCount(
  barRef: RefObject<HTMLDivElement | null>,
  actionCount: number,
  deps: unknown[]
): number {
  const [count, setCount] = useState(actionCount)

  useEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const measure = () => {
      const box = bar.getBoundingClientRect()
      const right = box.right - BAR_PADDING
      const buttons = Array.from(bar.querySelectorAll<HTMLElement>(':scope > button'))
      // Hidden buttons keep their room, so the last one's edge is what all of them need
      const last = buttons.at(-1)
      if (last) {
        void window.api.fitToolbarWidth(last.getBoundingClientRect().right - box.left + BAR_PADDING)
      }
      let fits = 0
      // A pixel of slack for fractional display scaling
      while (fits < buttons.length && buttons[fits].getBoundingClientRect().right <= right + 1) {
        fits++
      }
      setCount(Math.min(actionCount, Math.max(1, fits)))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barRef, actionCount, ...deps])

  return count
}

/**
 * Fires on mouse release, and — when a dwell time is configured — on hovering
 * the button for that long, which triggers the action without ever pressing it.
 *
 * The release, not a click: there is no click on Windows. This window is
 * `focusable: false`, so Chromium answers the WM_MOUSEACTIVATE of the press
 * with MA_NOACTIVATEANDEAT ("do not activate, and discard the mouse message"),
 * and Windows drops the button-down before the page ever sees it. The
 * button-up is delivered as usual, so the DOM gets a mouseup with no mousedown
 * ahead of it — and therefore never a click. Moves are untouched, which is why
 * hover dwell has always worked there.
 */
function ToolbarButton({
  action,
  hoverDelay,
  hidden,
  children
}: {
  action: ToolbarActionName
  hoverDelay: number
  hidden: boolean
  children: ReactNode
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDwelling, setIsDwelling] = useState(false)

  const cancelDwell = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsDwelling(false)
  }, [])

  // Drop a pending dwell when the setting changes or the toolbar goes away
  useEffect(() => cancelDwell, [cancelDwell, hoverDelay])

  const handleMouseEnter = () => {
    if (!hoverDelay) return
    setIsDwelling(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      // Stays inert until the cursor leaves and comes back, so parking the
      // mouse on a button cannot fire it over and over
      setIsDwelling(false)
      void window.api.triggerAction(action)
    }, hoverDelay)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(hidden && 'invisible')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelDwell}
      onMouseUp={(event) => {
        if (event.button !== 0) return
        cancelDwell()
        void window.api.triggerAction(action)
      }}
    >
      {children}
      {isDwelling && (
        <span className="dwell-progress" style={{ animationDuration: `${hoverDelay}ms` }} />
      )}
    </Button>
  )
}
