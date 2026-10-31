const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-source.cjs')

/**
 * actions.ts with Electron and the modules it acts on replaced: `handlers` are
 * its IPC handlers, `calls` what reached the conversation and the screenshots.
 */
function setup() {
  const handlers = new Map()
  const calls = { hint: 0, screenshot: 0, stopAnswer: 0 }
  const state = { inConversationPage: true, inScreenshotPage: false, ignoreMouse: false }
  global.mainWindow = {
    isDestroyed: () => false,
    getPosition: () => [0, 0],
    setPosition: () => {},
    webContents: { send: () => {} }
  }
  load('src/main/actions.ts', {
    electron: {
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
    './state': {
      state,
      setPageChangeHandler: () => {},
      inModePage: () => state.inConversationPage || state.inScreenshotPage
    },
    './conversation': {
      requestHint: () => calls.hint++,
      stopHints: () => false,
      toggleSpeaker: () => {}
    },
    './screenshot': {
      newScreenshot: async () => calls.screenshot++,
      appendScreenshot: async () => {},
      snipScreenshot: async () => {},
      pickRegion: async () => null,
      stopAnswer: () => calls.stopAnswer++
    }
  })
  return { calls, handlers, state }
}

test('the toolbar runs its buttons, and nothing else', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, handlers } = setup()
  assert.equal(handlers.get('triggerAction')(null, 'takeScreenshot'), true)
  assert.equal(calls.screenshot, 1)
  assert.equal(handlers.get('triggerAction')(null, 'hideOrShowMainWindow'), false)
  assert.equal(handlers.get('triggerAction')(null, 'toString'), false)
})

test('no global shortcut is registered', (t) => {
  t.after(() => delete global.mainWindow)
  const { handlers } = setup()
  assert.equal(handlers.has('initShortcuts'), false)
})

test('stop acts on the mode on screen', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, handlers, state } = setup()
  state.inConversationPage = false
  state.inScreenshotPage = true
  handlers.get('triggerAction')(null, 'stopSolutionStream')
  assert.equal(calls.stopAnswer, 1)
})

test('each click counts', (t) => {
  t.after(() => delete global.mainWindow)
  const { calls, handlers } = setup()
  handlers.get('triggerAction')(null, 'generateHint')
  handlers.get('triggerAction')(null, 'generateHint')
  assert.equal(calls.hint, 2)
})
