import { useEffect, useState } from 'react'
import { HelpCircle, SettingsIcon, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store/app'
import { useSettingsStore } from '@/lib/store/settings'

export function AppHeader() {
  const navigate = useNavigate()
  const { ignoreMouse } = useAppStore()
  // A shortcut or a toolbar hover can switch either unnoticed, so both stay in view
  const model = useSettingsStore(
    (state) => state.apiProfiles.find((p) => p.id === state.conversationProfileId)?.model
  )
  const sceneName = useSettingsStore(
    (state) => state.scenes.find((s) => s.id === state.conversationSceneId)?.name
  )
  const context = [sceneName, model].filter(Boolean).join(' · ')
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
        <span className="truncate">语音面试助手</span>
        {appVersion && <span className="shrink-0 text-[10px] opacity-60">v{appVersion}</span>}
      </div>
      {context && (
        <span
          className="min-w-0 truncate pr-2 text-[10px] opacity-60 pointer-events-none"
          style={{ flex: '0 4 auto', minWidth: 0 }}
        >
          {context}
        </span>
      )}
      <div className={`actions flex items-center ${ignoreMouse ? 'pointer-events-none' : ''}`}>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate('/settings?tab=hints')}
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
