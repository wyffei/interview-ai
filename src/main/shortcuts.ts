import { globalShortcut, ipcMain, screen } from 'electron'
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
import { requestHint, stopHints, clearConversation } from './conversation'

type Shortcut = {
  action: string
  key: string
  status: ShortcutStatus
  registeredKeys: string[]
}

enum ShortcutStatus {
  Registered = 'registered',
  Failed = 'failed',
  /** Shortcut is available to register but not registered. */
  Available = 'available'
}

const MOVE_STEP = 200
/** Opacity delta per shortcut press, matching the settings slider step */
const OPACITY_STEP = 0.05
const shortcuts: Record<string, Shortcut> = {}

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
 * main), so the shortcut only asks the renderer to step it.
 */
function adjustOpacity(delta: number) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
  mainWindow.webContents.send('adjust-opacity', delta)
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
 * leaves this working — the settings page and the shortcut can both drive it.
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

const callbacks: Record<string, () => void> = {
  hideOrShowMainWindow: async () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (process.platform === 'win32') {
      if (isWindowSoftHidden) {
        restoreSoftHiddenWindow(mainWindow)
        return
      }

      if (!mainWindow.isVisible()) {
        showMainWindow(mainWindow)
        return
      }

      softHideWindow(mainWindow)
      return
    }

    if (mainWindow.isVisible()) {
      stopBackgroundGuard()
      mainWindow.hide()
    } else {
      // 重新显示时不断重申置顶属性，抵消其他前台软件持续抢占
      showMainWindow(mainWindow)
    }
  },

  // Stop the hints being written
  stopSolutionStream: () => {
    if (state.inConversationPage) stopHints()
  },

  /**
   * Ask the renderer to step the current mode through the saved AI profiles.
   * The list lives in the renderer store (persisted there), so main only
   * relays the direction.
   */
  nextApiProfile: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('switch-api-profile', 1)
  },

  previousApiProfile: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('switch-api-profile', -1)
  },

  /**
   * The scenes live in the renderer store, so main only asks it to step; the
   * new prompt comes back as `conversationPrompt` and is read at the next hint.
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
    adjustOpacity(OPACITY_STEP)
  },

  decreaseOpacity: () => {
    adjustOpacity(-OPACITY_STEP)
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

  moveMainWindowUp: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y - MOVE_STEP)
  },

  moveMainWindowDown: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y + MOVE_STEP)
  },

  moveMainWindowLeft: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x - MOVE_STEP, y)
  },

  moveMainWindowRight: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + MOVE_STEP, y)
  },

  toggleTranscription: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !inModePage()) return
    mainWindow.webContents.send('toggle-transcription')
  },

  // Starts the conversation over
  clearTranscription: () => {
    if (state.inConversationPage) clearConversation()
  },

  // 对话模式: a hint now, whatever the automatic mode is waiting for
  generateHint: () => {
    if (state.inConversationPage) requestHint()
  },

  // 对话模式: the renderer owns the setting, main reads it back on the next sentence
  toggleHintMode: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inConversationPage) return
    mainWindow.webContents.send('toggle-hint-mode')
  }
}

const clickableActions = new Set([
  'stopSolutionStream',
  'ignoreOrEnableMouse',
  'increaseOpacity',
  'decreaseOpacity',
  'pageUp',
  'pageDown',
  'moveMainWindowUp',
  'moveMainWindowDown',
  'moveMainWindowLeft',
  'moveMainWindowRight',
  'toggleTranscription',
  'clearTranscription',
  'cycleScene',
  'generateHint',
  'toggleHintMode'
])

function unregisterShortcut(action: string) {
  const shortcut = shortcuts[action]
  if (!shortcut) return
  if (shortcut.registeredKeys.length) {
    shortcut.registeredKeys.forEach((registeredKey) => {
      globalShortcut.unregister(registeredKey)
    })
  } else {
    globalShortcut.unregister(shortcut.key)
  }
  shortcut.status = ShortcutStatus.Available
  shortcut.registeredKeys = []
}

function getShortcutRegistrationKeys(key: string) {
  const keys = [key]
  if (process.platform !== 'win32') {
    return keys
  }
  const parts = key.split('+')
  const hasAlt = parts.includes('Alt')
  const hasCtrl = parts.includes('CommandOrControl') || parts.includes('Control')
  if (hasAlt && !hasCtrl) {
    const aliasParts = [...parts]
    const altIndex = aliasParts.indexOf('Alt')
    if (altIndex >= 0) {
      aliasParts.splice(altIndex, 0, 'CommandOrControl')
      const aliasKey = aliasParts.join('+')
      if (!keys.includes(aliasKey)) {
        keys.push(aliasKey)
      }
    }
  }
  return keys
}

function registerShortcut(action: string, key: string) {
  if (shortcuts[action]) {
    unregisterShortcut(action)
  }

  const keysToRegister = getShortcutRegistrationKeys(key)
  const registeredKeys: string[] = []
  keysToRegister.forEach((shortcutKey) => {
    if (globalShortcut.register(shortcutKey, callbacks[action])) {
      registeredKeys.push(shortcutKey)
    }
  })

  shortcuts[action] = {
    action,
    key,
    status: registeredKeys.length ? ShortcutStatus.Registered : ShortcutStatus.Failed,
    registeredKeys
  }
}

ipcMain.handle('getShortcuts', () => shortcuts)

ipcMain.handle(
  'initShortcuts',
  (_event, shortcuts: Record<string, { action: string; key: string }>) => {
    Object.entries(shortcuts).forEach(([action, { key }]) => {
      registerShortcut(action, key)
    })
  }
)

ipcMain.handle('updateShortcuts', (_event, _shortcuts: { action: string; key: string }[]) => {
  _shortcuts.forEach((shortcut) => {
    if (shortcuts[shortcut.action]?.key !== shortcut.key) {
      registerShortcut(shortcut.action, shortcut.key)
    }
  })
})

ipcMain.handle('triggerAction', (_event, action: string) => {
  if (!clickableActions.has(action)) return false
  callbacks[action]?.()
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
