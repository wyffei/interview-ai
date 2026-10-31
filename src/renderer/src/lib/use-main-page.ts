import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSettingsStore, type AppMode } from './store/settings'
import { useAppStore } from './store/app'

/** Where the conversation page lives, the page a new install opens on */
export const HOME_PATH = '/'

/** Each mode's page */
export const MODE_PATHS: Record<AppMode, string> = {
  conversation: HOME_PATH,
  screenshot: '/screenshot'
}

export const MODE_NAMES: Record<AppMode, string> = {
  conversation: '对话模式',
  screenshot: '截图模式'
}

export const otherMode = (mode: AppMode): AppMode =>
  mode === 'screenshot' ? 'conversation' : 'screenshot'

/** Where the settings, help and 面试准备 back buttons lead: the mode page last shown */
export function useHomePath(): string {
  return MODE_PATHS[useSettingsStore((state) => state.lastMode)]
}

/**
 * What both mode pages do besides showing their content: tell main which one
 * is up, apply the window opacity, and answer the toolbar's scene step and
 * mode switch.
 */
export function useModePage(mode: AppMode): void {
  const navigate = useNavigate()
  const opacity = useSettingsStore((state) => state.opacity)
  const syncAppState = useAppStore((state) => state.syncAppState)

  useEffect(() => {
    document.body.style.opacity = opacity.toString()
    return () => {
      document.body.style.opacity = ''
    }
  }, [opacity])

  // The next start and the back buttons open where the user left off
  useEffect(() => {
    useSettingsStore.getState().updateSetting('lastMode', mode)
  }, [mode])

  useEffect(() => {
    const key = mode === 'screenshot' ? 'inScreenshotPage' : 'inConversationPage'
    window.api.updateAppState({ [key]: true })
    return () => {
      window.api.updateAppState({ [key]: false })
    }
  }, [mode])

  useEffect(() => {
    window.api.onSyncAppState((state) => syncAppState(state))
    return () => {
      window.api.removeSyncAppStateListener()
    }
  }, [syncAppState])

  useEffect(() => {
    window.api.onAdjustOpacity((delta) => {
      useSettingsStore.getState().adjustOpacity(delta)
    })
    return () => {
      window.api.removeAdjustOpacityListener()
    }
  }, [])

  useEffect(() => {
    window.api.onCycleScene(() => {
      const name = useSettingsStore.getState().cycleScene(mode)
      if (!name) return
      // A request already streaming keeps the prompt it started with
      toast(`已切换到「${name}」`, {
        description: mode === 'screenshot' ? '下次截图生效' : '下次出提示生效',
        duration: 3000
      })
    })
    return () => {
      window.api.removeCycleSceneListener()
    }
  }, [mode])

  // Main already resent the request without the switch; this only explains why
  // the answer may be slower than the setting promises
  useEffect(() => {
    window.api.onThinkingUnsupported((model, thinking) => {
      const name = thinking === 'on' ? '开启思考' : '关闭思考'
      toast(`当前模型不支持${name}，已按默认方式请求`, {
        description: `${model}：可在设置里把这个配置的「思考」改回「默认」`,
        duration: 5000
      })
    })
    return () => {
      window.api.removeThinkingUnsupportedListener()
    }
  }, [])

  useEffect(() => {
    window.api.onSwitchMode(() => navigate(MODE_PATHS[otherMode(mode)]))
    return () => {
      window.api.removeSwitchModeListener()
    }
  }, [mode, navigate])
}
