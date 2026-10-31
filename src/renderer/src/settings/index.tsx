import { useEffect, useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  ArrowLeft,
  Bot,
  Camera,
  LibraryBig,
  Lightbulb,
  MessagesSquare,
  Mic,
  Palette,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { useHomePath } from '@/lib/use-main-page'
import { AiModelsSection } from './sections/AiModelsSection'
import { VoiceSection } from './sections/VoiceSection'
import { AppearanceSection } from './sections/AppearanceSection'
import { ConversationSection } from './sections/ConversationSection'
import { KnowledgeSection } from './sections/KnowledgeSection'
import { ScreenshotSection } from './sections/ScreenshotSection'

type Tab = 'hints' | 'screenshot' | 'ai' | 'knowledge' | 'voice' | 'appearance'

type NavItem = { tab: Tab; label: string; Icon: LucideIcon }

/**
 * One group per page of settings, in nav order. 对话模式 is a row like 截图模式,
 * opening its first page, with its three pages under it. Each mode page's
 * settings button opens its own tab
 */
const NAV: (NavItem | { heading: string; Icon: LucideIcon; items: NavItem[] })[] = [
  { tab: 'ai', label: 'AI 模型', Icon: Bot },
  { tab: 'screenshot', label: '截图模式', Icon: Camera },
  {
    heading: '对话模式',
    Icon: MessagesSquare,
    items: [
      { tab: 'hints', label: '出提示', Icon: Lightbulb },
      { tab: 'knowledge', label: '资料库', Icon: LibraryBig },
      { tab: 'voice', label: '语音', Icon: Mic }
    ]
  },
  { tab: 'appearance', label: '界面与隐私', Icon: Palette }
]

const TABS = NAV.flatMap((entry) => ('heading' in entry ? entry.items : [entry])).map(
  (item) => item.tab
)

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('tab') as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'ai'
  const setActiveProfile = useSettingsStore((state) => state.setActiveProfile)
  const syncAppState = useAppStore((state) => state.syncAppState)
  const contentRef = useRef<HTMLDivElement>(null)
  const homePath = useHomePath()

  const openTab = (next: Tab) => setSearchParams({ tab: next }, { replace: true })
  // From the profile picker: open that profile in the AI 模型 group
  const editProfile = (id: string) => {
    setActiveProfile(id)
    openTab('ai')
  }

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab])

  /**
   * Click-through is suspended while this page is up — the switch that turns
   * it back off lives here, so letting it apply would swallow the very clicks
   * needed to undo it. Main keeps the preference and applies it on the way out,
   * so the switch still reflects what the user chose.
   */
  useEffect(() => {
    window.api.updateAppState({ inSettingsPage: true })
    return () => {
      window.api.updateAppState({ inSettingsPage: false })
    }
  }, [])

  useEffect(() => {
    window.api.onSyncAppState((state) => syncAppState(state))
    return () => {
      window.api.removeSyncAppStateListener()
    }
  }, [syncAppState])

  useEffect(() => {
    return () => {
      document.body.style.opacity = ''
    }
  }, [])

  const sections: Record<Tab, ReactNode> = {
    ai: <AiModelsSection />,
    knowledge: <KnowledgeSection />,
    voice: <VoiceSection />,
    appearance: <AppearanceSection />,
    hints: (
      <ConversationSection
        onEditProfile={editProfile}
        onOpenVoice={() => openTab('voice')}
        onOpenKnowledge={() => openTab('knowledge')}
      />
    ),
    screenshot: <ScreenshotSection onEditProfile={editProfile} />
  }

  return (
    <>
      {/* Header */}
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="w-12 mr-2 rounded-none">
            <Link to={homePath}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <h1>设置</h1>
      </div>

      {/* The page itself never scrolls: the nav stays put, the content scrolls */}
      <div id="app-content" className="flex" style={{ overflow: 'hidden' }}>
        <nav className="flex w-36 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-black/10 p-2 max-[640px]:w-12">
          {NAV.map((entry) =>
            'heading' in entry ? (
              <div key={entry.heading} className="flex flex-col gap-0.5">
                <NavButton
                  item={{ tab: entry.items[0].tab, label: entry.heading, Icon: entry.Icon }}
                  active={false}
                  onOpen={openTab}
                />
                {entry.items.map((item) => (
                  <NavButton
                    key={item.tab}
                    item={item}
                    indent
                    active={item.tab === tab}
                    onOpen={openTab}
                  />
                ))}
              </div>
            ) : (
              <NavButton key={entry.tab} item={entry} active={entry.tab === tab} onOpen={openTab} />
            )
          )}
        </nav>
        <div ref={contentRef} className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {sections[tab]}
        </div>
      </div>
    </>
  )
}

function NavButton({
  item: { tab, label, Icon },
  indent = false,
  active,
  onOpen
}: {
  item: NavItem
  /** Under a group heading */
  indent?: boolean
  active: boolean
  onOpen: (tab: Tab) => void
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors cursor-pointer select-none max-[640px]:justify-center max-[640px]:px-0',
        indent && 'pl-8',
        active ? 'bg-gray-300/80 font-medium' : 'hover:bg-gray-300/40'
      )}
      onClick={() => onOpen(tab)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate max-[640px]:hidden">{label}</span>
    </button>
  )
}
