/**
 * The window's handling (top-most, soft-hide while picking, click-through) and
 * the actions the overlay toolbar triggers. There are no global shortcuts: the
 * toolbar and the page are the controls.
 */
import { ipcMain, screen } from 'electron'
import type { BrowserWindow } from 'electron'
import { applyContentProtection } from './main-window'
import {
  showToolbar,
  hideToolbar,
  setToolbarWanted,
  reassertToolbarTopMost,
  sendToToolbar
} from './toolbar-window'
import { state, setPageChangeHandler, inModePage } from './state'
import { requestHint, stopHints, toggleSpeaker } from './conversation'
import {
  appendScreenshot,
  newScreenshot,
  pickRegion,
  snipScreenshot,
  stopAnswer
} from './screenshot'

const FRONT_REASSERT_DURATION = 8000
const FRONT_REASSERT_INTERVAL = 100
const FRONT_RELATIVE_LEVEL = 100
const BACKGROUND_GUARD_INTERVAL = 2000
let frontReassertTimer: NodeJS.Timeout | null = null
let backgroundGuardTimer: NodeJS.Timeout | null = null
let isWindowSoftHidden = false
let softHiddenPosition: [number, number] | null = null

/**
 * Reassert always-on-top. `aggressive` also calls moveTop() which
 * brings the window above everything — only use on explicit user actions
 * (showing the window) to avoid disturbing interaction with other apps.
 */
function applyTopMost(win: BrowserWindow, aggressive = true) {
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(true, 'screen-saver', FRONT_RELATIVE_LEVEL)
  if (aggressive) win.moveTop()

  if (state.ignoreMouse) {
    reassertToolbarTopMost(FRONT_RELATIVE_LEVEL + 1, aggressive)
  }
}

/**
 * Start a persistent low-frequency background guard that continuously
 * re-asserts always-on-top while the window is visible.
 * Uses the non-aggressive variant so it won't steal focus or
 * interfere with the user's interaction with other windows.
 */
function startBackgroundGuard(window: BrowserWindow) {
  if (backgroundGuardTimer) return // already running
  backgroundGuardTimer = setInterval(() => {
    if (!window || window.isDestroyed() || !window.isVisible()) {
      stopBackgroundGuard()
      return
    }
    applyTopMost(window, false)
  }, BACKGROUND_GUARD_INTERVAL)
}

function stopBackgroundGuard() {
  if (backgroundGuardTimer) {
    clearInterval(backgroundGuardTimer)
    backgroundGuardTimer = null
  }
}

function stopFrontReassert() {
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }
}

/**
 * Soft-hide parks the window here and puts it back by position alone. Its size
 * is never read and rewritten: on Windows the DIP <-> pixel conversion encloses
 * in both directions, so every such round trip would hand back a slightly
 * larger window (see toolbar-window.ts).
 */
function getOffscreenPosition(): [number, number] {
  const displays = screen.getAllDisplays()
  const maxRight = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
  const topMost = Math.min(...displays.map((display) => display.bounds.y))

  return [maxRight + 2000, topMost]
}

function softHideWindow(window: BrowserWindow) {
  if (isWindowSoftHidden || window.isDestroyed()) return

  stopFrontReassert()
  stopBackgroundGuard()
  softHiddenPosition = window.getPosition() as [number, number]
  isWindowSoftHidden = true

  window.setOpacity(0)
  window.setIgnoreMouseEvents(true)
  window.setPosition(...getOffscreenPosition())
  hideToolbar()
}

function restoreSoftHiddenWindow(window: BrowserWindow) {
  if (!isWindowSoftHidden || !softHiddenPosition || window.isDestroyed()) return

  applyContentProtection(window, true)
  window.setPosition(...softHiddenPosition)
  window.setOpacity(1)

  isWindowSoftHidden = false
  softHiddenPosition = null
  // Not the raw preference: it stays suspended if this is the settings page
  applyIgnoreMouse()
  showToolbar()
  keepWindowInFront(window)
}

function showMainWindow(window: BrowserWindow) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.showInactive()
  } else {
    window.show()
  }

  applyContentProtection(window, process.platform === 'win32')
  showToolbar()
  keepWindowInFront(window)
}

/** Bring the window back, whichever way it was hidden */
function revealMainWindow(window: BrowserWindow) {
  if (isWindowSoftHidden) restoreSoftHiddenWindow(window)
  else if (!window.isVisible()) showMainWindow(window)
}

/**
 * Keep the main window out of the way while the user drags on the region
 * picker: it would cover part of the screen, and the top-most guard would keep
 * lifting it back above the picker. A window that was already soft-hidden, by
 * the user or by a pick in progress, is left for whoever hid it to bring back.
 */
async function whilePicking<T>(mainWindow: BrowserWindow, pick: () => Promise<T>): Promise<T> {
  const wasHidden = isWindowSoftHidden
  softHideWindow(mainWindow)
  try {
    return await pick()
  } finally {
    if (!wasHidden) restoreSoftHiddenWindow(mainWindow)
  }
}

/** Ask the renderer to show the other mode's page; it owns the routes */
function switchMode() {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
  mainWindow.webContents.send('switch-mode')
}

function keepWindowInFront(window: BrowserWindow) {
  if (!window || window.isDestroyed()) return
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }

  const start = Date.now()
  const reassert = () => {
    if (!window.isVisible() || window.isDestroyed()) return false
    applyTopMost(window)
    return true
  }

  if (!reassert()) return

  // Aggressive burst: rapid reasserts for a short period
  frontReassertTimer = setInterval(() => {
    const shouldStop = Date.now() - start > FRONT_REASSERT_DURATION
    if (shouldStop || !reassert()) {
      if (frontReassertTimer) {
        clearInterval(frontReassertTimer)
        frontReassertTimer = null
      }
    }
  }, FRONT_REASSERT_INTERVAL)

  // Ensure background guard is running for persistent protection
  startBackgroundGuard(window)
}

/**
 * Opacity is owned by the renderer settings store (persisted + synced back to
 * main), so the toolbar button only asks the renderer to step it.
 */
function adjustOpacity(direction: 1 | -1) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
  // One level up or down; the renderer owns the levels
  mainWindow.webContents.send('adjust-opacity', direction)
}

/**
 * Hand the stored click-through state to the window.
 *
 * It stays off while the settings page is on screen even when the user asked
 * for it: the switch that turns it back off lives on that page, so applying it
 * there would swallow the clicks needed to undo it. The preference is kept, and
 * takes effect the moment the user leaves the page.
 */
function applyIgnoreMouse(): void {
  const mainWindow = global.mainWindow
  // A soft-hidden window ignores the mouse regardless; it is reapplied on restore
  if (!mainWindow || mainWindow.isDestroyed() || isWindowSoftHidden) return
  mainWindow.setIgnoreMouseEvents(state.ignoreMouse && !state.inSettingsPage)
}

/** Tell both renderers what the window is actually doing */
function broadcastAppState(): void {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-app-state', state)
  }
  // The toolbar is a separate renderer with its own store, so it needs its own
  // copy; without this its button keeps showing the state it last saw
  sendToToolbar('sync-app-state', state)
}

/**
 * Turn click-through on or off. Independent of the overlay toolbar: the
 * toolbar is one way to operate the window, not a requirement, so hiding it
 * leaves this working — the settings page drives it too.
 */
export function setIgnoreMouse(ignore: boolean): void {
  state.ignoreMouse = ignore
  applyIgnoreMouse()
  // Keep the toolbar visible if it is wanted, so its button stays reachable;
  // a soft-hidden window still counts as visible, so check that separately
  if (!isWindowSoftHidden) showToolbar()
  broadcastAppState()
}

// Leaving or entering the settings page changes whether the stored preference
// may be applied, so re-run it on every page change
setPageChangeHandler(() => {
  applyIgnoreMouse()
  broadcastAppState()
})

/** What each toolbar button does */
const actions: Record<string, () => void> = {
  // Stop the hints being written, or 截图模式's answer
  stopSolutionStream: () => {
    if (state.inConversationPage) stopHints()
    else if (state.inScreenshotPage) stopAnswer()
  },

  /**
   * The scenes live in the renderer store, so main only asks it to step the
   * mode on screen; the new prompt comes back and is read at the next request.
   */
  cycleScene: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('cycle-scene')
  },

  ignoreOrEnableMouse: () => {
    setIgnoreMouse(!state.ignoreMouse)
  },

  increaseOpacity: () => {
    adjustOpacity(1)
  },

  decreaseOpacity: () => {
    adjustOpacity(-1)
  },

  pageUp: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('scroll-page-up')
  },

  pageDown: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('scroll-page-down')
  },

  // 对话模式's listening, from either mode page: it goes on while 截图模式 is up
  toggleTranscription: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('toggle-transcription')
  },

  // A hint now, whatever automatic hinting is waiting for
  generateHint: () => {
    if (state.inConversationPage) requestHint()
  },

  // The renderer owns the setting, main reads it back on the next sentence
  toggleHintMode: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inConversationPage) return
    mainWindow.webContents.send('toggle-hint-mode')
  },

  // 手机面试模式: 我在说 ⇄ 对方在说. Not page-bound: listening goes on everywhere
  toggleSpeaker: () => {
    toggleSpeaker()
  },

  // 截图模式 ⇄ 对话模式
  switchMode,

  takeScreenshot: () => {
    void newScreenshot()
  },

  appendScreenshot: () => {
    void appendScreenshot()
  },

  snipScreenshot: () => {
    void snipScreenshot(whilePicking, revealMainWindow)
  }
}

// Only the toolbar's buttons: anything else the renderer asks for is refused
ipcMain.handle('triggerAction', (_event, action: string) => {
  if (!Object.hasOwn(actions, action)) return false
  actions[action]()
  return true
})

ipcMain.handle('setToolbarVisible', (_event, visible: boolean) => {
  setToolbarWanted(visible)
})

/**
 * Set click-through from the settings page. A plain `set` rather than the
 * toolbar's toggle, so the switch always lands on the state the user picked.
 */
ipcMain.handle('setIgnoreMouse', (_event, ignore: boolean) => {
  setIgnoreMouse(ignore)
  return state.ignoreMouse
})

// 截图模式's settings: drag out the capture region
ipcMain.handle('pickCaptureRegion', () => pickRegion(whilePicking))
