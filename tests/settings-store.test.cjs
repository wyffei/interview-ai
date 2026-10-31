const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const load = require('./load-source.cjs')

const STORE = 'interview-coder-settings'

// One fixture per file, so a preset's default can be told from another's
const prompts = Object.fromEntries(
  fs
    .readdirSync(path.join(__dirname, '../src/renderer/src/lib/store/prompts'))
    .map((name) => [`./prompts/${name}?raw`, `fixture prompt ${name}`])
)

/**
 * The renderer's two places a store lives: the file main keeps (window.api)
 * and this window's localStorage. Each `open()` is a fresh start of the app
 * reading what the previous one left.
 */
function environment({ files = {}, local = {} } = {}) {
  const fileStore = new Map(Object.entries(files))
  const localStore = new Map(Object.entries(local))
  global.window = {
    api: {
      readStore: (name) => fileStore.get(name) ?? null,
      writeStore: (name, value) => fileStore.set(name, value),
      removeStore: (name) => fileStore.delete(name)
    }
  }
  global.localStorage = {
    getItem: (key) => localStore.get(key) ?? null,
    setItem: (key, value) => localStore.set(key, value),
    removeItem: (key) => localStore.delete(key)
  }
  return {
    fileStore,
    localStore,
    open: () => load('src/renderer/src/lib/store/settings.ts', prompts).useSettingsStore
  }
}

function cleanup() {
  delete global.window
  delete global.localStorage
}

test('a new install starts on the technical interview scene', (t) => {
  t.after(cleanup)
  const store = environment().open()
  assert.equal(store.getState().conversationSceneId, 'tech-interview')
  assert.equal(store.getState().conversationPrompt, 'fixture prompt tech-interview.md')
})

test('what the user set survives a restart, in the file and its localStorage mirror', (t) => {
  t.after(cleanup)
  const env = environment()
  env.open().getState().updateSetting('conversationMinChars', 12)
  assert.ok(env.fileStore.has(STORE))
  assert.ok(env.localStore.has(STORE))
  assert.equal(env.open().getState().conversationMinChars, 12)
})

test('with no file yet, the localStorage copy is adopted and written to the file at once', (t) => {
  t.after(cleanup)
  const saved = JSON.stringify({ state: { conversationMinChars: 9 }, version: 8 })
  const env = environment({ local: { [STORE]: saved } })
  assert.equal(env.open().getState().conversationMinChars, 9)
  assert.equal(env.fileStore.get(STORE), saved)
})

test('the file wins over localStorage once it exists', (t) => {
  t.after(cleanup)
  const env = environment({
    files: { [STORE]: JSON.stringify({ state: { conversationMinChars: 5 }, version: 8 }) },
    local: { [STORE]: JSON.stringify({ state: { conversationMinChars: 9 }, version: 8 }) }
  })
  assert.equal(env.open().getState().conversationMinChars, 5)
})

test('a key added by an update takes its default; the keys the user set are kept', (t) => {
  t.after(cleanup)
  const env = environment()
  env.open().getState().updateSetting('conversationMinChars', 12)
  const saved = JSON.parse(env.fileStore.get(STORE))
  delete saved.state.phoneAutoMe
  env.fileStore.set(STORE, JSON.stringify(saved))
  const store = env.open()
  assert.equal(store.getState().phoneAutoMe, true)
  assert.equal(store.getState().conversationMinChars, 12)
})

test('an emptied preset prompt falls back to its default', (t) => {
  t.after(cleanup)
  const env = environment()
  const store = env.open()
  store.getState().updateScenePrompt('tech-interview', '  \n')
  assert.equal(store.getState().conversationPrompt, 'fixture prompt tech-interview.md')
  assert.equal(env.open().getState().conversationPrompt, 'fixture prompt tech-interview.md')
})

test('a deleted preset stays deleted after a restart and comes back with its default', (t) => {
  t.after(cleanup)
  const env = environment()
  const store = env.open()
  store.getState().updateScenePrompt('english-interview', 'edited')
  assert.equal(store.getState().removeScene('english-interview'), true)

  const restarted = env.open()
  assert.equal(
    restarted.getState().scenes.some((s) => s.id === 'english-interview'),
    false
  )
  restarted.getState().restorePresetScenes()
  const restored = restarted.getState().scenes.find((s) => s.id === 'english-interview')
  assert.equal(restored.prompt, 'fixture prompt english-interview.md')
})
