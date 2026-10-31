import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '../main/settings'
import type { AppState } from '../main/state'
import type { ListModelsOptions, ModelListResult } from '../main/model-list'
import type { TranscriptionOptions } from '../main/transcription'
import type { ToolbarStatus } from '../main/toolbar-window'
import type { ConversationSnapshot, HintCard, Speaker, Utterance } from '../shared/conversation'
import type { KnowledgeDoc, KnowledgeImportResult, KnowledgePatch } from '../shared/knowledge'
import type { Briefing, BriefingChunkKind, BriefingRoute } from '../shared/briefing'
import type { AvailableUpdate } from '../shared/update'
import type { RegionPickerData } from '../main/region-picker'
import type { CaptureRegion, RegionRect } from '../shared/capture-region'
import type { ScreenshotSummary } from '../shared/screenshot'

// Custom APIs for renderer
const api = {
  // Get the installed app version (package.json version at build time)
  getAppVersion: () => ipcRenderer.invoke('getAppVersion') as Promise<string>,
  // A newer release main found (null: none); Windows downloads and installs it on request
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status') as Promise<AvailableUpdate | null>,
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback: (update: AvailableUpdate) => void) => {
    ipcRenderer.on('update-status', (_event, update: AvailableUpdate) => callback(update))
  },
  removeUpdateStatusListener: () => {
    ipcRenderer.removeAllListeners('update-status')
  },
  // The renderer's persisted stores, kept as files by main (see main store-file.ts)
  readStore: (name: string) => ipcRenderer.sendSync('store:get', name) as string | null,
  writeStore: (name: string, value: string) => ipcRenderer.send('store:set', name, value),
  removeStore: (name: string) => ipcRenderer.send('store:remove', name),
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

  // Run one of the overlay toolbar's buttons
  triggerAction: (
    action:
      | 'stopSolutionStream'
      | 'ignoreOrEnableMouse'
      | 'increaseOpacity'
      | 'decreaseOpacity'
      | 'pageUp'
      | 'pageDown'
      | 'toggleTranscription'
      | 'cycleScene'
      | 'generateHint'
      | 'toggleHintMode'
      | 'toggleSpeaker'
      | 'switchMode'
      | 'takeScreenshot'
      | 'appendScreenshot'
      | 'snipScreenshot'
  ) => ipcRenderer.invoke('triggerAction', action),
  setToolbarVisible: (visible: boolean) => ipcRenderer.invoke('setToolbarVisible', visible),
  // The width the toolbar's buttons need; main sizes the window to it until the user drags it
  fitToolbarWidth: (width: number) => ipcRenderer.invoke('toolbar:fit-width', width),
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
  // Listening / hint mode as the toolbar's buttons show them, pushed from main
  getToolbarStatus: () => ipcRenderer.invoke('getToolbarStatus') as Promise<ToolbarStatus>,
  onSyncToolbarStatus: (callback: (status: ToolbarStatus) => void) => {
    ipcRenderer.on('sync-toolbar-status', (_event, status) => {
      callback(status)
    })
  },
  removeSyncToolbarStatusListener: () => {
    ipcRenderer.removeAllListeners('sync-toolbar-status')
  },

  // Listen for window opacity adjustments from the toolbar
  onAdjustOpacity: (callback: (delta: number) => void) => {
    ipcRenderer.on('adjust-opacity', (_event, delta) => {
      callback(delta)
    })
  },
  removeAdjustOpacityListener: () => {
    ipcRenderer.removeAllListeners('adjust-opacity')
  },

  // The toolbar asked to step to the next prompt scene
  onCycleScene: (callback: () => void) => {
    ipcRenderer.on('cycle-scene', () => callback())
  },
  removeCycleSceneListener: () => {
    ipcRenderer.removeAllListeners('cycle-scene')
  },

  // The active model refused 「关闭思考」 / 「开启思考」, so its requests now go without it
  onThinkingUnsupported: (callback: (model: string, mode: 'on' | 'off') => void) => {
    ipcRenderer.on('thinking-unsupported', (_event, model: string, mode: 'on' | 'off') =>
      callback(model, mode)
    )
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

  // The toolbar asked for the other mode's page
  onSwitchMode: (callback: () => void) => {
    ipcRenderer.on('switch-mode', () => callback())
  },
  removeSwitchModeListener: () => {
    ipcRenderer.removeAllListeners('switch-mode')
  },

  // 截图模式 (main screenshot.ts): the answer streams in as these events. They are
  // followed for the whole life of the main window, not only while its page is up
  stopScreenshotAnswer: () => ipcRenderer.invoke('screenshot:stop') as Promise<boolean>,
  // False when there was nothing to follow up on (or no key); no event will follow then
  sendFollowUpQuestion: (question: string) =>
    ipcRenderer.invoke('screenshot:follow-up', question) as Promise<boolean>,
  onScreenshotEvents: (handlers: {
    capturing: (capturing: boolean) => void
    /** A new question, numbered `id`; the one on screen moves to the history */
    clear: (id: number) => void
    /** A question's record, made after its answer (only when saving is on) */
    summary: (id: number, summary: ScreenshotSummary) => void
    screenshots: (screenshots: string[], total: number) => void
    chunk: (chunk: string) => void
    reasoningChunk: (chunk: string) => void
    roundStart: () => void
    loading: (loading: boolean) => void
    complete: () => void
    stopped: () => void
    error: (message: string) => void
  }) => {
    const listeners: [string, Parameters<typeof ipcRenderer.on>[1]][] = [
      [
        'screenshot-capturing',
        (_event: unknown, capturing: boolean) => handlers.capturing(capturing)
      ],
      ['solution-clear', (_event: unknown, id: number) => handlers.clear(id)],
      [
        'screenshot-summary',
        (_event: unknown, id: number, summary: ScreenshotSummary) => handlers.summary(id, summary)
      ],
      [
        'screenshots-updated',
        (_event: unknown, screenshots: string[], total: number) =>
          handlers.screenshots(screenshots, total)
      ],
      ['solution-chunk', (_event: unknown, chunk: string) => handlers.chunk(chunk)],
      ['reasoning-chunk', (_event: unknown, chunk: string) => handlers.reasoningChunk(chunk)],
      ['reasoning-round-start', () => handlers.roundStart()],
      ['ai-loading-start', () => handlers.loading(true)],
      ['ai-loading-end', () => handlers.loading(false)],
      ['solution-complete', () => handlers.complete()],
      ['solution-stopped', () => handlers.stopped()],
      ['solution-error', (_event: unknown, message: string) => handlers.error(message)]
    ]
    for (const [channel, listener] of listeners) ipcRenderer.on(channel, listener)
    return () => {
      for (const [channel, listener] of listeners) ipcRenderer.removeListener(channel, listener)
    }
  },
  // Cover every screen and let the user drag out the capture region; null if cancelled
  pickCaptureRegion: () => ipcRenderer.invoke('pickCaptureRegion') as Promise<CaptureRegion | null>,
  // A new capture region was picked (settings or toolbar); the store persists it
  onCaptureRegionPicked: (callback: (region: CaptureRegion) => void) => {
    const listener = (_event: unknown, region: CaptureRegion) => callback(region)
    ipcRenderer.on('capture-region-picked', listener)
    return () => void ipcRenderer.removeListener('capture-region-picked', listener)
  },
  // The picker windows (main region-picker.ts)
  getRegionPickerData: () =>
    ipcRenderer.invoke('getRegionPickerData') as Promise<RegionPickerData | null>,
  regionPickerReady: () => ipcRenderer.send('region-picker-ready'),
  finishRegionPicker: (rect: RegionRect | null) => ipcRenderer.send('finish-region-picker', rect),

  // Select the directory conversations are saved to
  selectConversationDir: () =>
    ipcRenderer.invoke('selectConversationDir') as Promise<string | null>,

  // Main owns the conversation, the page takes a snapshot and follows the events
  getConversationSnapshot: () =>
    ipcRenderer.invoke('conversation:get-snapshot') as Promise<ConversationSnapshot>,
  requestHint: () => ipcRenderer.invoke('conversation:request-hint'),
  stopHints: () => ipcRenderer.invoke('conversation:stop-hints'),
  // 「清空对话」: main asks the page first when a 面试准备 would go too
  requestClearConversation: () => ipcRenderer.invoke('conversation:request-clear'),
  clearConversation: (keepBriefing: boolean) =>
    ipcRenderer.invoke('conversation:clear', keepBriefing),
  onConversationConfirmClear: (callback: () => void) => {
    ipcRenderer.on('conversation-confirm-clear', () => callback())
  },
  setConversationNote: (text: string) => ipcRenderer.invoke('conversation:set-note', text),
  // Enter in the note box; true when a bare number answered a 「可确认」 and the box should empty
  submitConversationNote: () => ipcRenderer.invoke('conversation:submit-note') as Promise<boolean>,
  // 手机面试模式: flip who is talking now, or correct one sentence
  toggleSpeaker: () => ipcRenderer.invoke('conversation:toggle-speaker'),
  setUtteranceSpeaker: (id: number, speaker: Speaker) =>
    ipcRenderer.invoke('conversation:set-utterance-speaker', id, speaker),
  onConversationSpeaker: (callback: (speaker: Speaker) => void) => {
    ipcRenderer.on('conversation-speaker', (_event, speaker: Speaker) => callback(speaker))
  },
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
  // The toolbar asked to flip between automatic and manual hints
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
      'conversation-speaker',
      'conversation-confirm-clear',
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
  // 面试准备: the target company / JD and the 行业卡片 researched from them (main briefing.ts)
  getBriefing: () => ipcRenderer.invoke('briefing:get') as Promise<Briefing>,
  getBriefingRoute: (webSearch: boolean) =>
    ipcRenderer.invoke('briefing:route', webSearch) as Promise<BriefingRoute>,
  // The card, then the self-introduction written as `introRequirements` asks
  generateBriefing: (company: string, jd: string, webSearch: boolean, introRequirements: string) =>
    ipcRenderer.invoke('briefing:generate', company, jd, webSearch, introRequirements),
  regenerateIntro: (introRequirements: string) =>
    ipcRenderer.invoke('briefing:intro', introRequirements),
  // The self-introduction as edited or written by hand; blank drops it
  setIntro: (text: string) => ipcRenderer.invoke('briefing:set-intro', text),
  // Pick a resume file and keep its text; resolves to why it failed, or null
  pickResume: () => ipcRenderer.invoke('briefing:pick-resume') as Promise<string | null>,
  removeResume: () => ipcRenderer.invoke('briefing:remove-resume'),
  // The company / JD as typed, kept until 清空对话 even if no card is asked for
  setBriefingInput: (company: string, jd: string) =>
    ipcRenderer.invoke('briefing:set-input', company, jd),
  stopBriefing: () => ipcRenderer.invoke('briefing:stop'),
  clearBriefing: () => ipcRenderer.invoke('briefing:clear'),
  // Undo 「清空对话」 having taken the card with it
  restoreBriefing: () => ipcRenderer.invoke('briefing:restore'),
  onBriefingCleared: (callback: (company: string) => void) => {
    const listener = (_event: unknown, company: string) => callback(company)
    ipcRenderer.on('briefing-cleared', listener)
    return () => void ipcRenderer.removeListener('briefing-cleared', listener)
  },
  // Both return an unsubscribe: the hint panel and the 面试准备 page each follow it
  onBriefingUpdate: (callback: (briefing: Briefing) => void) => {
    const listener = (_event: unknown, briefing: Briefing) => callback(briefing)
    ipcRenderer.on('briefing-update', listener)
    return () => void ipcRenderer.removeListener('briefing-update', listener)
  },
  onBriefingChunk: (callback: (kind: BriefingChunkKind, delta: string) => void) => {
    const listener = (_event: unknown, kind: BriefingChunkKind, delta: string) =>
      callback(kind, delta)
    ipcRenderer.on('briefing-chunk', listener)
    return () => void ipcRenderer.removeListener('briefing-chunk', listener)
  },

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
