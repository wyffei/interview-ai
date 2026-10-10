import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '../main/settings'
import type { AppState } from '../main/state'
import type { ListModelsOptions, ModelListResult } from '../main/model-list'
import type { TranscriptionOptions } from '../main/transcription'
import type { ConversationSnapshot, HintCard, Utterance } from '../shared/conversation'
import type { KnowledgeDoc, KnowledgeImportResult, KnowledgePatch } from '../shared/knowledge'

// Custom APIs for renderer
const api = {
  // Get the installed app version (package.json version at build time)
  getAppVersion: () => ipcRenderer.invoke('getAppVersion') as Promise<string>,
  // Get app settings
  getAppSettings: () => ipcRenderer.invoke('getAppSettings'),
  // Update app settings
  updateAppSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke('updateAppSettings', settings),
  // Fetch the model IDs an OpenAI-compatible platform serves (its `/models` endpoint)
  listModels: (baseURL: string, apiKey: string, options?: ListModelsOptions) =>
    ipcRenderer.invoke('listModels', baseURL, apiKey, options) as Promise<ModelListResult>,

  // Resize transparent frameless windows without toggling Electron's native resizable style
  startWindowResize: (direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw') =>
    ipcRenderer.send('window-resize-start', direction),
  stopWindowResize: () => ipcRenderer.send('window-resize-stop'),

  // Update app state
  updateAppState: (state: Partial<AppState>) => ipcRenderer.invoke('updateAppState', state),
  getAppState: () => ipcRenderer.invoke('getAppState') as Promise<AppState>,
  // Listen for app state
  onSyncAppState: (callback: (state: AppState) => void) => {
    ipcRenderer.on('sync-app-state', (_event, state) => {
      callback(state)
    })
  },
  // Remove app state listener
  removeSyncAppStateListener: () => {
    ipcRenderer.removeAllListeners('sync-app-state')
  },

  // Init shortcuts
  initShortcuts: (shortcuts: Record<string, { action: string; key: string }>) =>
    ipcRenderer.invoke('initShortcuts', shortcuts),
  // Get shortcuts
  getShortcuts: () => ipcRenderer.invoke('getShortcuts'),
  // Update shortcuts
  updateShortcuts: (shortcuts: { action: string; key: string }[]) =>
    ipcRenderer.invoke('updateShortcuts', shortcuts),

  // Trigger the small set of user-facing actions exposed by the overlay toolbar.
  triggerAction: (
    action:
      | 'stopSolutionStream'
      | 'ignoreOrEnableMouse'
      | 'increaseOpacity'
      | 'decreaseOpacity'
      | 'pageUp'
      | 'pageDown'
      | 'moveMainWindowUp'
      | 'moveMainWindowDown'
      | 'moveMainWindowLeft'
      | 'moveMainWindowRight'
      | 'toggleTranscription'
      | 'clearTranscription'
      | 'cycleScene'
      | 'generateHint'
      | 'toggleHintMode'
  ) => ipcRenderer.invoke('triggerAction', action),
  setToolbarVisible: (visible: boolean) => ipcRenderer.invoke('setToolbarVisible', visible),
  // Set click-through from the settings page; returns the state main ended up in
  setIgnoreMouse: (ignore: boolean) =>
    ipcRenderer.invoke('setIgnoreMouse', ignore) as Promise<boolean>,

  // Settings the toolbar window needs, pushed from main (its own store is a separate copy)
  onSyncToolbarSettings: (
    callback: (settings: { hoverDelay: number; theme: 'dark' | 'light' }) => void
  ) => {
    ipcRenderer.on('sync-toolbar-settings', (_event, settings) => {
      callback(settings)
    })
  },
  removeSyncToolbarSettingsListener: () => {
    ipcRenderer.removeAllListeners('sync-toolbar-settings')
  },

  // Listen for window opacity adjustments triggered by shortcuts
  onAdjustOpacity: (callback: (delta: number) => void) => {
    ipcRenderer.on('adjust-opacity', (_event, delta) => {
      callback(delta)
    })
  },
  removeAdjustOpacityListener: () => {
    ipcRenderer.removeAllListeners('adjust-opacity')
  },

  // Shortcut asked to step through the saved AI profiles (+1 / -1)
  onSwitchApiProfile: (callback: (direction: number) => void) => {
    ipcRenderer.on('switch-api-profile', (_event, direction: number) => callback(direction))
  },
  removeSwitchApiProfileListener: () => {
    ipcRenderer.removeAllListeners('switch-api-profile')
  },

  // Shortcut or toolbar asked to step to the next prompt scene
  onCycleScene: (callback: () => void) => {
    ipcRenderer.on('cycle-scene', () => callback())
  },
  removeCycleSceneListener: () => {
    ipcRenderer.removeAllListeners('cycle-scene')
  },

  // The active model refused 「关闭思考」, so its requests now go without it
  onThinkingUnsupported: (callback: (model: string) => void) => {
    ipcRenderer.on('thinking-unsupported', (_event, model: string) => callback(model))
  },
  removeThinkingUnsupportedListener: () => {
    ipcRenderer.removeAllListeners('thinking-unsupported')
  },

  // Listen for scroll page up
  onScrollPageUp: (callback: () => void) => {
    ipcRenderer.on('scroll-page-up', callback)
  },
  // Remove scroll page up listener
  removeScrollPageUpListener: () => {
    ipcRenderer.removeAllListeners('scroll-page-up')
  },

  // Listen for scroll page down
  onScrollPageDown: (callback: () => void) => {
    ipcRenderer.on('scroll-page-down', callback)
  },
  // Remove scroll page down listener
  removeScrollPageDownListener: () => {
    ipcRenderer.removeAllListeners('scroll-page-down')
  },

  // Select the directory 对话模式's conversations are saved to
  selectConversationDir: () =>
    ipcRenderer.invoke('selectConversationDir') as Promise<string | null>,

  // 对话模式: main owns the conversation, the page takes a snapshot and follows the events
  getConversationSnapshot: () =>
    ipcRenderer.invoke('conversation:get-snapshot') as Promise<ConversationSnapshot>,
  requestHint: () => ipcRenderer.invoke('conversation:request-hint'),
  stopHints: () => ipcRenderer.invoke('conversation:stop-hints'),
  clearConversation: () => ipcRenderer.invoke('conversation:clear'),
  onConversationUtterance: (callback: (utterance: Utterance) => void) => {
    ipcRenderer.on('conversation-utterance', (_event, utterance: Utterance) => callback(utterance))
  },
  onConversationUtteranceRemoved: (callback: (id: number) => void) => {
    ipcRenderer.on('conversation-utterance-removed', (_event, id: number) => callback(id))
  },
  onConversationHint: (callback: (card: HintCard) => void) => {
    ipcRenderer.on('conversation-hint', (_event, card: HintCard) => callback(card))
  },
  onConversationHintChunk: (callback: (id: number, chunk: string) => void) => {
    ipcRenderer.on('conversation-hint-chunk', (_event, id: number, chunk: string) =>
      callback(id, chunk)
    )
  },
  onConversationCleared: (callback: () => void) => {
    ipcRenderer.on('conversation-cleared', () => callback())
  },
  onConversationNotice: (callback: (message: string) => void) => {
    ipcRenderer.on('conversation-notice', (_event, message: string) => callback(message))
  },
  // Shortcut or toolbar asked to flip between automatic and manual hints
  onToggleHintMode: (callback: () => void) => {
    ipcRenderer.on('toggle-hint-mode', () => callback())
  },
  removeConversationListeners: () => {
    for (const channel of [
      'conversation-utterance',
      'conversation-utterance-removed',
      'conversation-hint',
      'conversation-hint-chunk',
      'conversation-cleared',
      'conversation-notice',
      'toggle-hint-mode'
    ]) {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // 资料库: main keeps the material on disk, sends it with hints or searches it per question
  listKnowledge: () => ipcRenderer.invoke('knowledge:list') as Promise<KnowledgeDoc[]>,
  getKnowledgeText: (id: string) => ipcRenderer.invoke('knowledge:get-text', id) as Promise<string>,
  // Open a file dialog and import what was picked; null if cancelled
  pickKnowledgeFiles: () =>
    ipcRenderer.invoke('knowledge:pick-files') as Promise<KnowledgeImportResult | null>,
  importKnowledgeFiles: (paths: string[]) =>
    ipcRenderer.invoke('knowledge:import-files', paths) as Promise<KnowledgeImportResult>,
  createKnowledge: (name: string, text: string) =>
    ipcRenderer.invoke('knowledge:create', name, text) as Promise<KnowledgeDoc>,
  updateKnowledge: (id: string, patch: KnowledgePatch) =>
    ipcRenderer.invoke('knowledge:update', id, patch) as Promise<KnowledgeDoc | null>,
  reimportKnowledge: (id: string) =>
    ipcRenderer.invoke('knowledge:reimport', id) as Promise<{ doc?: KnowledgeDoc; error?: string }>,
  removeKnowledge: (id: string) => ipcRenderer.invoke('knowledge:remove', id) as Promise<void>,
  // Where a dropped file lives on disk (`File.path` is gone since Electron 32)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Transcription
  startTranscription: (apiKey: string, options?: TranscriptionOptions) =>
    ipcRenderer.invoke('start-transcription', apiKey, options),
  stopTranscription: () => ipcRenderer.invoke('stop-transcription'),
  sendTranscriptionAudioChunk: (chunk: ArrayBuffer) =>
    ipcRenderer.send('transcription-audio-chunk', chunk),

  onToggleTranscription: (callback: () => void) => {
    ipcRenderer.on('toggle-transcription', callback)
  },
  removeToggleTranscriptionListener: () => {
    ipcRenderer.removeAllListeners('toggle-transcription')
  },
  onTranscriptionError: (callback: (message: string) => void) => {
    ipcRenderer.on('transcription-error', (_event, message) => callback(message))
  },
  removeTranscriptionErrorListener: () => {
    ipcRenderer.removeAllListeners('transcription-error')
  },
  onTranscriptionStopped: (callback: () => void) => {
    ipcRenderer.on('transcription-stopped', callback)
  },
  removeTranscriptionStoppedListener: () => {
    ipcRenderer.removeAllListeners('transcription-stopped')
  }
}

export type MainAPI = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
