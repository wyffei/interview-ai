import { ipcMain } from 'electron'

/**
 * Runs when the page on screen changes. Click-through is suspended while the
 * settings page is up (see `applyIgnoreMouse` in shortcuts.ts), and the
 * toolbar is only shown on the conversation page, so both need to be told.
 */
let onPageChange: (() => void) | null = null

export function setPageChangeHandler(handler: () => void): void {
  onPageChange = handler
}

ipcMain.handle('updateAppState', (_event, next: Partial<AppState>) => {
  const before = { ...state }
  Object.assign(state, next)
  if (
    state.inSettingsPage !== before.inSettingsPage ||
    state.inConversationPage !== before.inConversationPage ||
    // The toolbar shows the buttons of the mode on screen
    state.inScreenshotPage !== before.inScreenshotPage
  ) {
    onPageChange?.()
  }
})

// A window that loads after the last broadcast (the toolbar) asks for it
ipcMain.handle('getAppState', () => state)

export const state = {
  /** The conversation page is on screen; the shortcuts that act on it check this */
  inConversationPage: false,
  /** 截图模式's page is on screen */
  inScreenshotPage: false,
  /**
   * Whether the settings page is on screen. Click-through is suspended there:
   * every control needed to turn it back off lives on that page, so applying it
   * would leave the user with a window they cannot click.
   */
  inSettingsPage: false,
  ignoreMouse: false
}

export type AppState = typeof state

/** One of the two mode pages is on screen, where the window shortcuts act */
export function inModePage(): boolean {
  return state.inConversationPage || state.inScreenshotPage
}
