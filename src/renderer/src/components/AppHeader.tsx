import { useEffect, useState } from 'react'
import { HelpCircle, SettingsIcon, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store/app'
import { scenesOf, useSettingsStore, type AppMode } from '@/lib/store/settings'
import { MODE_NAMES } from '@/lib/use-main-page'

/** The settings group each mode page's settings button opens */
const SETTINGS_TAB: Record<AppMode, string> = { conversation: 'hints', screenshot: 'screenshot' }

export function AppHeader({ mode = 'conversation' }: { mode?: AppMode }) {
  const navigate = useNavigate()
  const { ignoreMouse, update } = useAppStore()
  // A shortcut or a toolbar hover can switch either unnoticed, so both stay in view
  const model = useSettingsStore((state) => {
    const id = mode === 'screenshot' ? state.screenshotProfileId : state.conversationProfileId
    return state.apiProfiles.find((p) => p.id === id)?.model
  })
  const allScenes = useSettingsStore((state) => state.scenes)
  const scenes = scenesOf(allScenes, mode)
  const sceneId = useSettingsStore((state) =>
    mode === 'screenshot' ? state.screenshotSceneId : state.conversationSceneId
  )
  const setActiveScene = useSettingsStore((state) => state.setActiveScene)
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  return (
    <div id="app-header" className="flex items-center gap-1">
      {/*
        Flex shrink decides what survives a narrow window. The higher the
        factor, the sooner that item is squeezed, and it disappears once it
        reaches `min-width: 0`:
          title    flex: 1 8 auto  compressed first, being the least informative
          context  flex: 0 4 auto  next (scene · model); still in the settings page
      */}
      <div
        className="flex min-w-0 items-baseline justify-center gap-1.5 px-2"
        style={{ flex: '1 8 auto', minWidth: 0 }}
      >
        <span className="truncate">
          语音面试助手{mode === 'screenshot' && ` · ${MODE_NAMES.screenshot}`}
        </span>
        {appVersion && <span className="shrink-0 text-[10px] opacity-60">v{appVersion}</span>}
        {update && (
          // Details and the download are on the help page
          <button
            className="shrink-0 cursor-pointer rounded-sm bg-emerald-600 px-1 text-[10px] leading-4 text-white [-webkit-app-region:no-drag] hover:bg-emerald-500"
            onClick={() => navigate('/help')}
          >
            有新版本
          </button>
        )}
      </div>
      <div
        className={`flex min-w-0 items-center gap-1 pr-2 text-[10px] ${ignoreMouse ? 'pointer-events-none' : ''}`}
        style={{ flex: '0 4 auto', minWidth: 0 }}
      >
        {/* Picked straight from the list: stepping through many scenes with the shortcut is slow */}
        {scenes.length > 0 && (
          <Select value={sceneId} onValueChange={setActiveScene}>
            <SelectTrigger
              size="sm"
              className="min-w-0 data-[size=sm]:h-6 gap-1 border-none bg-transparent px-1 py-0 text-[10px] opacity-70 shadow-none hover:opacity-100 dark:bg-transparent [-webkit-app-region:no-drag] [&_svg]:size-3"
            >
              <SelectValue placeholder="场景" />
            </SelectTrigger>
            <SelectContent>
              {scenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id} className="text-xs">
                  {scene.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {model && (
          <span className="min-w-0 truncate opacity-60 pointer-events-none">· {model}</span>
        )}
      </div>
      <div className={`actions flex items-center ${ignoreMouse ? 'pointer-events-none' : ''}`}>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate(`/settings?tab=${SETTINGS_TAB[mode]}`)}
        >
          <SettingsIcon />
        </Button>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate('/help')}
        >
          <HelpCircle />
        </Button>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50 hover:text-red-500"
          onClick={() => window.close()}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
