const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

/**
 * shortcuts.ts with Electron and the modules it acts on replaced: `press(key)`
 * is the OS firing a registered global shortcut, `calls` what reached the
 * conversation and the window.
 */
function setup() {
  const handlers = new Map()
  const registered = new Map()
  const calls = { hint: 0, moves: 0 }
  const state = { inConversationPage: true, ignoreMouse: false }
  global.mainWindow = {
    isDestroyed: () => false,
    getPosition: () => [0, 0],
    setPosition: () => calls.moves++,
    webContents: { send: () => {} }
  }
  load('src/main/shortcuts.ts', {
    electron: {
      globalShortcut: {
        register: (key, fn) => (registered.set(key, fn), true),
        unregister: (key) => registered.delete(key)
      },
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      screen: {}
    },
    './main-window': { applyContentProtection: () => {} },
    './toolbar-window': {
      showToolbar: () => {},
      hideToolbar: () => {},
      setToolbarWanted: () => {},
      reassertToolbarTopMost: () => {},
      sendToToolbar: () => {}
    },
    './state': { state, setPageChangeHandler: () => {} },
    './conversation': {
      requestHint: () => calls.hint++,
      stopHints: () => false,
      requestClear: () => {},
      toggleSpeaker: () => {}
    }
  })
  handlers.get('initShortcuts')(null, {
    generateHint: { action: 'generateHint', key: 'CommandOrControl+G' },
    moveMainWindowUp: { action: 'moveMainWindowUp', key: 'CommandOrControl+Up' }
  })
  return { calls, handlers, press: (key) => registered.get(key)() }
}

test('a held shortcut fires its action once', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, press } = setup()
  // Windows' auto-repeat, about every 30ms while the keys are held
  for (let i = 0; i < 10; i++) press('CommandOrControl+G')
  assert.equal(calls.hint, 1)
})

test('a press after the keys were let go fires again', async (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, press } = setup()
  press('CommandOrControl+G')
  await new Promise((resolve) => setTimeout(resolve, 650))
  press('CommandOrControl+G')
  assert.equal(calls.hint, 2)
})

test('stepping actions repeat while held', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, press } = setup()
  for (let i = 0; i < 5; i++) press('CommandOrControl+Up')
  assert.equal(calls.moves, 5)
})

test('the toolbar is not a key press: each click counts', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, handlers } = setup()
  handlers.get('triggerAction')(null, 'generateHint')
  handlers.get('triggerAction')(null, 'generateHint')
  assert.equal(calls.hint, 2)
})
