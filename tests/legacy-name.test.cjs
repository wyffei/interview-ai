const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const load = require('./load-source.cjs')

/**
 * legacy-name.ts against a scratch appData folder. `folders` maps a folder
 * name to the files in it; an empty one stands for the folder Electron makes
 * before main runs.
 */
function start(folders, { userData, renameFails = false } = {}) {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-name-'))
  for (const [name, files] of Object.entries(folders)) {
    fs.mkdirSync(path.join(appData, name), { recursive: true })
    for (const [file, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(appData, name, file), text)
    }
  }
  const paths = { appData, userData: userData ?? path.join(appData, 'interview-ai') }
  const realFs = require('fs')
  load('src/main/legacy-name.ts', {
    electron: {
      app: {
        name: 'interview-ai',
        getPath: (name) => paths[name],
        setPath: (name, value) => (paths[name] = value)
      }
    },
    fs: renameFails
      ? {
          ...realFs,
          renameSync: () => {
            throw new Error('EBUSY')
          }
        }
      : realFs
  })
  const read = (...parts) => fs.readFileSync(path.join(appData, ...parts), 'utf8')
  const exists = (...parts) => fs.existsSync(path.join(appData, ...parts))
  return { appData, paths, read, exists }
}

test('the old folder is taken over on the first start, files and all', () => {
  const { paths, read, exists } = start({
    'interview-coder-cn': { 'settings.json': 'mine' },
    // What Electron makes before main runs
    'interview-ai': {}
  })
  assert.equal(read('interview-ai', 'settings.json'), 'mine')
  assert.equal(exists('interview-coder-cn'), false)
  assert.equal(paths.userData.endsWith('interview-ai'), true)
})

test('once this version has data of its own, the old folder is left alone', () => {
  const { read } = start({
    'interview-coder-cn': { 'settings.json': 'old' },
    'interview-ai': { 'settings.json': 'new' }
  })
  assert.equal(read('interview-ai', 'settings.json'), 'new')
  assert.equal(read('interview-coder-cn', 'settings.json'), 'old')
})

test('a move that fails uses the old folder in place', () => {
  const { appData, paths, read } = start(
    { 'interview-coder-cn': { 'settings.json': 'mine' } },
    { renameFails: true }
  )
  assert.equal(paths.userData, path.join(appData, 'interview-coder-cn'))
  assert.equal(read('interview-coder-cn', 'settings.json'), 'mine')
})

test('a fresh install, or a --user-data-dir of its own, moves nothing', () => {
  const fresh = start({})
  assert.equal(fresh.exists('interview-coder-cn'), false)

  const custom = start(
    { 'interview-coder-cn': { 'settings.json': 'mine' } },
    { userData: path.join(os.tmpdir(), 'driver-profile') }
  )
  assert.equal(custom.read('interview-coder-cn', 'settings.json'), 'mine')
})
