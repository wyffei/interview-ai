import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import ConversationPage from '@/conversation'
import SettingsPage from '@/settings'
import HelpPage from '@/help'
import BriefingPage from '@/briefing'
import { OverlayToolbar } from '@/toolbar/OverlayToolbar'
import { useSettingsStore } from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { getCloneableFields } from '@/lib/utils'
import { applyTheme } from '@/lib/theme'
import { WindowResizeHandles } from '@/components/WindowResizeHandles'
import { MODE_PATHS } from '@/lib/use-main-page'
import ScreenshotPage from '@/screenshot'
import { followScreenshotAnswer } from '@/screenshot/events'
import { followListening } from '@/conversation/listening'

export default function App() {
  const [initialized, setInitialized] = useState(false)
  const settingsStore = useSettingsStore()
  const theme = useSettingsStore((state) => state.theme)

  // Paint the window before syncing with main, so the first frame already uses
  // the persisted theme; the toolbar window gets the live value pushed to it.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    window.api.getAppSettings().then((settings) => {
      const blankFields = Object.keys(settings).filter(
        (key) => settings[key] && !settingsStore[key]
      )
      settingsStore.syncSettings(
        blankFields.reduce(
          (acc, key) => {
            acc[key] = settings[key]
            return acc
          },
          {} as Partial<typeof settingsStore>
        )
      )
      setInitialized(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialized) {
      window.api.updateAppSettings(getCloneableFields(settingsStore))
    }
  }, [initialized, settingsStore])

  // A newer release, as main finds it: at startup and every few hours after
  useEffect(() => {
    const { setUpdate } = useAppStore.getState()
    window.api.getUpdateStatus().then(setUpdate)
    window.api.onUpdateStatus(setUpdate)
    return () => window.api.removeUpdateStatusListener()
  }, [])

  return (
    <>
      <HashRouter>
        <ToolbarVisibilityController />
        <WindowResizeController />
        <MainWindowEvents />
        <Routes>
          <Route index element={<ConversationPage />} />
          <Route path="screenshot" element={<ScreenshotPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="briefing" element={<BriefingPage />} />
          <Route path="toolbar" element={<OverlayToolbar />} />
        </Routes>
      </HashRouter>

      <Toaster />
    </>
  )
}

/** The toolbar window renders its own handles; this covers the main window's routes */
function WindowResizeController() {
  const location = useLocation()
  const resizable = useSettingsStore((state) => state.resizable)

  if (location.pathname === '/toolbar') return null
  return <WindowResizeHandles enabled={resizable} />
}

function ToolbarVisibilityController() {
  const location = useLocation()

  useEffect(() => {
    // The toolbar window renders this app too, but must not drive its own visibility
    if (location.pathname === '/toolbar') return
    const onModePage = Object.values(MODE_PATHS).includes(location.pathname)
    // Always there on a mode page: with no shortcuts, it is how the app is driven
    void window.api.setToolbarVisible(onModePage)
  }, [location.pathname])

  return null
}

/**
 * What the main window follows whatever page is up: 截图模式's answer (one
 * still streaming when the user opens the settings must be complete on
 * return), a capture region picked from the toolbar, and 对话模式's listening,
 * whose toolbar button is on both mode pages.
 */
function MainWindowEvents() {
  const isToolbar = useLocation().pathname === '/toolbar'

  useEffect(() => {
    if (isToolbar) return
    const offEvents = followScreenshotAnswer()
    const offRegion = window.api.onCaptureRegionPicked((region) =>
      useSettingsStore.getState().updateSetting('captureRegion', region)
    )
    // The toolbar's listening button is on both mode pages
    const offListening = followListening()
    return () => {
      offEvents()
      offRegion()
      offListening()
    }
  }, [isToolbar])

  return null
}
