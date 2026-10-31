import { useEffect, useRef } from 'react'
import { Mic, PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/lib/store/settings'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { useConversationStore } from '@/lib/store/conversation'
import { isMine } from '../../../shared/conversation'

/** How close to the bottom still counts as following the conversation */
const STICK_THRESHOLD = 40

/**
 * The other side's sentences; the ones a hovered hint answers are highlighted.
 * In 手机面试模式 the user's own are here too, marked 我: the header switches
 * who is talking now, and a sentence's tag corrects who said it.
 */
export function TranscriptPanel() {
  const utterances = useConversationStore((state) => state.utterances)
  const focused = useConversationStore((state) =>
    state.hints.find((h) => h.id === state.focusedHintId)
  )
  const speaker = useConversationStore((state) => state.speaker)
  const isTranscribing = useTranscriptionStore((state) => state.isTranscribing)
  const phoneMode = useSettingsStore((state) => state.phoneMode)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Follow new sentences, unless the user scrolled up to reread something
  const sticky = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && sticky.current) el.scrollTop = el.scrollHeight
  }, [utterances])

  return (
    <section className="flex w-2/5 min-w-0 shrink-0 flex-col border-r border-app-border max-[560px]:h-32 max-[560px]:w-full max-[560px]:border-r-0 max-[560px]:border-b">
      <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-xs text-app-muted-fg select-none">
        <span className="font-medium">{phoneMode ? '对话' : '对方说的话'}</span>
        {isTranscribing && (
          <span className="flex items-center gap-1 text-green-500">
            <Mic className="size-3.5 animate-pulse" />
            正在听
          </span>
        )}
        {phoneMode && (
          <button
            className={cn(
              'flex items-center rounded-md bg-app-chip p-0.5 cursor-pointer',
              speaker === 'me' && 'text-amber-500'
            )}
            onClick={() => void window.api.toggleSpeaker()}
          >
            {(['other', 'me'] as const).map((value) => (
              <span
                key={value}
                className={cn(
                  'rounded px-1.5 py-0.5',
                  value === speaker ? 'bg-[var(--app-hover-bg)]' : 'opacity-60'
                )}
              >
                {value === 'me' ? '我在说' : '对方在说'}
              </span>
            ))}
          </button>
        )}
        <button
          className="ml-auto flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--app-hover-bg)] cursor-pointer"
          onClick={() => updateSetting('conversationTranscriptHidden', true)}
        >
          <PanelLeftClose className="size-3.5" />
          收起
        </button>
      </div>
      <div
        ref={scrollRef}
        className="panel-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3"
        onScroll={(e) => {
          const el = e.currentTarget
          sticky.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD
        }}
      >
        {utterances.length === 0 ? (
          <p className="pt-1 text-sm text-app-muted-fg">
            {isTranscribing
              ? phoneMode
                ? '正在听…对方提问时保持「对方在说」，自己回答时切到「我在说」'
                : '正在听对方说话…'
              : phoneMode
                ? '开始监听后，双方说的话会逐句显示在这里；点一下某句话可以改正是谁说的'
                : '开始监听后，对方说的话会逐句显示在这里'}
          </p>
        ) : (
          utterances.map((u) => {
            const mine = isMine(u)
            // The whole sentence corrects who said it, not only its small tag
            const flip = () => void window.api.setUtteranceSpeaker(u.id, mine ? 'other' : 'me')
            return (
              <p
                key={u.id}
                onClick={phoneMode ? flip : undefined}
                className={cn(
                  'rounded-md bg-app-panel px-2 py-1 text-sm leading-relaxed text-app-panel-fg break-words transition-shadow',
                  phoneMode &&
                    'cursor-pointer select-none hover:ring-1 hover:ring-[var(--app-panel-fg)]/30',
                  !u.final && 'opacity-60',
                  // The user's answers are context, not questions: set apart and quieter
                  mine && 'ml-6 opacity-70',
                  mine && !u.final && 'opacity-40',
                  focused &&
                    !mine &&
                    u.id >= focused.fromId &&
                    u.id <= focused.toId &&
                    'ring-2 ring-sky-400/70'
                )}
              >
                {phoneMode && (
                  <span
                    className={cn(
                      'mr-1.5 rounded bg-app-chip px-1 text-[11px] align-[1px]',
                      mine && 'text-amber-500'
                    )}
                  >
                    {mine ? '我' : '对方'}
                  </span>
                )}
                {u.text}
              </p>
            )
          })
        )}
      </div>
    </section>
  )
}
