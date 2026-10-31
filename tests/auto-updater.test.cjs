const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const load = require('./load-source.cjs')

/**
 * auto-updater.ts on a given platform, with electron-updater and Electron's
 * `net` replaced. `sent` is every `update-status` the window got; `release` is
 * the tag `releases/latest/download/latest.yml` redirects to on macOS.
 */
function setup({ platform, version = '1.1.1', release }) {
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  const realSetInterval = global.setInterval
  global.setInterval = () => 0

  const handlers = new Map()
  const sent = []
  const updater = Object.assign(new EventEmitter(), {
    checks: 0,
    installs: 0,
    downloadResult: Promise.resolve(),
    checkForUpdates() {
      this.checks++
      return Promise.resolve()
    },
    downloadUpdate() {
      return this.downloadResult
    },
    quitAndInstall() {
      this.installs++
    }
  })
  const net = {
    request: () => {
      const request = new EventEmitter()
      request.followRedirect = () => {}
      request.abort = () => {}
      request.end = () =>
        setImmediate(() => {
          if (release) {
            request.emit(
              'redirect',
              302,
              'GET',
              `https://github.com/wyffei/interview-ai/releases/download/${release}/latest.yml`
            )
          }
          const response = new EventEmitter()
          request.emit('response', response)
          response.emit('end')
        })
      return request
    }
  }
  global.mainWindow = {
    isDestroyed: () => false,
    webContents: { send: (channel, update) => sent.push({ channel, ...update }) }
  }

  const { initAutoUpdater } = load('src/main/auto-updater.ts', {
    electron: {
      app: { getVersion: () => version },
      ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
      net
    },
    'electron-updater': { autoUpdater: updater }
  })
  try {
    initAutoUpdater()
  } finally {
    global.setInterval = realSetInterval
    Object.defineProperty(process, 'platform', realPlatform)
  }
  const invoke = (channel) => handlers.get(channel)()
  const cleanup = () => delete global.mainWindow
  return { updater, sent, invoke, cleanup }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('Windows: nothing is downloaded until the user asks, then it installs on request', async (t) => {
  const { updater, sent, invoke, cleanup } = setup({ platform: 'win32' })
  t.after(cleanup)
  assert.equal(updater.checks, 1)
  assert.equal(updater.autoDownload, false)

  updater.emit('update-available', { version: '1.2.0' })
  assert.deepEqual(await invoke('update:get-status'), {
    version: '1.2.0',
    url: 'https://github.com/wyffei/interview-ai/releases/tag/v1.2.0',
    installable: true,
    phase: 'available'
  })
  // Installing before the download is done does nothing
  invoke('update:install')
  assert.equal(updater.installs, 0)

  invoke('update:download')
  assert.equal(sent.at(-1).phase, 'downloading')
  updater.emit('download-progress', { percent: 42.7 })
  assert.equal(sent.at(-1).percent, 42)
  updater.emit('update-downloaded')
  assert.equal(sent.at(-1).phase, 'downloaded')

  invoke('update:install')
  await tick()
  assert.equal(updater.installs, 1)
  assert.ok(sent.every((s) => s.channel === 'update-status'))
})

test('Windows: a failed download says why and can be retried', async (t) => {
  const { updater, sent, invoke, cleanup } = setup({ platform: 'win32' })
  t.after(cleanup)
  updater.emit('update-available', { version: '1.2.0' })
  updater.downloadResult = Promise.reject(new Error('net::ERR_CONNECTION_RESET'))
  invoke('update:download')
  await tick()
  assert.equal(sent.at(-1).phase, 'failed')
  assert.equal(sent.at(-1).error, 'net::ERR_CONNECTION_RESET')

  updater.downloadResult = Promise.resolve()
  invoke('update:download')
  assert.equal(sent.at(-1).phase, 'downloading')
  assert.equal(sent.at(-1).error, undefined)
})

test('macOS: a newer Latest release links to its page, without electron-updater', async (t) => {
  const { updater, invoke, cleanup } = setup({ platform: 'darwin', release: 'v1.10.0' })
  t.after(cleanup)
  await tick()
  await tick()
  assert.equal(updater.checks, 0)
  assert.deepEqual(await invoke('update:get-status'), {
    version: '1.10.0',
    url: 'https://github.com/wyffei/interview-ai/releases/tag/v1.10.0',
    installable: false,
    phase: 'available'
  })
})

test('macOS: the running version or an older one is not announced', async (t) => {
  for (const release of ['v1.1.1', 'v1.0.9']) {
    const { invoke, cleanup } = setup({ platform: 'darwin', release })
    t.after(cleanup)
    await tick()
    await tick()
    assert.equal(await invoke('update:get-status'), null, release)
  }
})
