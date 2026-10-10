import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSettingsStore } from './store/settings'
import { useAppStore } from './store/app'

/** Where the conversation page lives; the settings and help pages lead back here */
export const HOME_PATH = '/'

/**
 * What the conversation page does besides showing the conversation: tell main
 * it is up, apply the window opacity, and answer the shortcuts that step its AI
 * profile and its prompt scene.
 */
export function useMainPage(): void {
  const opacity = useSettingsStore((state) => state.opacity)
  const syncAppState = useAppStore((state) => state.syncAppState)

  useEffect(() => {
    document.body.style.opacity = opacity.toString()
    return () => {
      document.body.style.opacity = ''
    }
  }, [opacity])

  useEffect(() => {
    window.api.updateAppState({ inConversationPage: true })
    return () => {
      window.api.updateAppState({ inConversationPage: false })
    }
  }, [])

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
    window.api.onSwitchApiProfile((direction) => {
      const profile = useSettingsStore.getState().cycleProfile(direction)
      if (!profile) {
        toast('只有一个配置，无法切换')
        return
      }
      toast(`已切换到「${profile.name}」`, {
        description: `${profile.model || '未设置模型'}${profile.disableThinking ? ' · 关闭思考' : ''}`,
        duration: 3000
      })
    })
    return () => {
      window.api.removeSwitchApiProfileListener()
    }
  }, [])

  useEffect(() => {
    window.api.onCycleScene(() => {
      const name = useSettingsStore.getState().cycleScene()
      if (!name) return
      // A hint already streaming keeps the prompt it started with
      toast(`已切换到「${name}」`, { description: '下次出提示生效', duration: 3000 })
    })
    return () => {
      window.api.removeCycleSceneListener()
    }
  }, [])

  // Main already resent the request without the switch; this only explains why
  // the hint may be slower than the setting promises
  useEffect(() => {
    window.api.onThinkingUnsupported((model) => {
      toast('当前模型不支持关闭思考，已按默认方式请求', {
        description: `${model}：可在设置里关掉这个配置的「关闭思考」`,
        duration: 5000
      })
    })
    return () => {
      window.api.removeThinkingUnsupportedListener()
    }
  }, [])
}
