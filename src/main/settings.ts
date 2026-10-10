import { app, dialog, ipcMain } from 'electron'
import type { ApiProfile } from '../shared/api-profile'
import type { HintMode } from '../shared/conversation'
import { setToolbarOpacity, syncToolbarSettings, updateToolbarStatus } from './toolbar-window'

ipcMain.handle('getAppVersion', () => {
  return app.getVersion()
})

ipcMain.handle('getAppSettings', () => {
  return settings
})

type SettingsListener = (previous: AppSettings) => void
const settingsListeners: SettingsListener[] = []

/** Run `listener` after every update from the renderer, with the settings as they were before it */
export function onSettingsChanged(listener: SettingsListener): void {
  settingsListeners.push(listener)
}

ipcMain.handle('updateAppSettings', (_event, _settings) => {
  const previous = { ...settings }
  Object.assign(settings, _settings)
  for (const listener of settingsListeners) listener(previous)
  if ('hideDockIcon' in _settings) {
    applyDockVisibility(settings.hideDockIcon)
  }
  if ('conversationHintMode' in _settings) {
    updateToolbarStatus({ hintMode: settings.conversationHintMode })
  }
  if ('opacity' in _settings) {
    setToolbarOpacity(settings.opacity)
  }
  if ('toolbarHoverDelay' in _settings || 'theme' in _settings) {
    syncToolbarSettings({
      hoverDelay: settings.toolbarHoverDelay,
      theme: settings.theme
    })
  }
})

/** Show/hide the macOS dock icon. No-op on other platforms. */
export function applyDockVisibility(hidden: boolean): void {
  if (process.platform !== 'darwin') return
  if (hidden) {
    app.dock?.hide()
  } else {
    app.dock?.show()
  }
}

/** Ask for a folder; null if the user cancels */
async function pickDirectory(title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

ipcMain.handle('selectConversationDir', () => pickDirectory('选择对话记录保存目录'))

export const settings = {
  /** Window colour scheme, kept in sync with the renderer; see renderer lib/theme.ts */
  theme: 'dark' as 'dark' | 'light',
  apiBaseURL: process.env.API_BASE_URL || '',
  apiKey: process.env.API_KEY || '',
  /** Extra request headers, one `Name: Value` per line; see shared/request-headers.ts */
  apiHeaders: '',
  model: process.env.MODEL || '',
  /**
   * The active profile's 「关闭思考」, see thinking.ts. Must stay falsy here:
   * App.tsx fills blank renderer fields from main, so `true` would overwrite a
   * user's "off".
   */
  disableThinking: false,
  /** Every saved AI profile, synced from the renderer; hints go out with `conversationProfileId` */
  apiProfiles: [] as ApiProfile[],
  conversationProfileId: '',
  /** The system prompt, from the renderer's active scene */
  conversationPrompt: '',
  /** Hint on every finished sentence (`auto`) or only on the shortcut */
  conversationHintMode: 'auto' as HintMode,
  /** Silence (ms) that ends a sentence in the recogniser */
  conversationSilenceMs: 800,
  /** A finished sentence shorter than this triggers no automatic hint */
  conversationMinChars: 4,
  /** Keep each conversation as a Markdown file, see save-conversation.ts */
  conversationAutoSave: false,
  /** Where the conversations go; blank means Documents/InterviewCoder */
  conversationSaveDir: '',
  /** Kept in sync with the renderer so the overlay toolbar can match the main window */
  opacity: 0.8,
  /**
   * Dwell time in ms before hovering a toolbar button fires it; 0 disables hover
   * triggering. The real default lives in the renderer store: App.tsx fills blank
   * renderer fields from here, so a truthy default would overwrite a user's "off".
   */
  toolbarHoverDelay: 0,
  dashscopeApiKey: '',
  hideDockIcon: false,
  audioInputDeviceId: '',
  audioOutputDeviceId: ''
}

export type AppSettings = typeof settings

/**
 * The profile hints are requested with. Until the renderer has synced its list
 * (or with only `.env` configured) the flat fields are all there is.
 */
export function getHintProfile(): ApiProfile {
  const profile = settings.apiProfiles.find((p) => p.id === settings.conversationProfileId)
  if (profile) return profile
  return {
    id: '',
    name: '',
    apiBaseURL: settings.apiBaseURL,
    apiKey: settings.apiKey,
    apiHeaders: settings.apiHeaders,
    model: settings.model,
    disableThinking: settings.disableThinking
  }
}
