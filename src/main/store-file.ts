import { app, ipcMain } from 'electron'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The renderer's persisted store (settings) as a file under userData.
 *
 * localStorage alone belongs to the page's origin, so the dev server
 * (http://localhost:5173) and the installed app (file://) each kept a settings
 * copy of their own, and switching between them looked like an update undoing
 * the user's choices. A file is the same for every build and every window, and
 * an update never touches it. The renderer still mirrors into localStorage, so
 * an older build started later finds the same settings.
 */

/** Only the stores the renderer persists; nothing else may be read or written through here */
const STORE_NAMES = new Set(['interview-coder-settings'])

function storePath(name: string): string {
  return join(app.getPath('userData'), 'stores', `${name}.json`)
}

// Synchronous, so zustand hydrates before the first render as it did from localStorage
ipcMain.on('store:get', (event, name: string) => {
  if (!STORE_NAMES.has(name)) {
    event.returnValue = null
    return
  }
  try {
    event.returnValue = readFileSync(storePath(name), 'utf8')
  } catch {
    // Not written yet: the renderer adopts what its localStorage holds
    event.returnValue = null
  }
})

ipcMain.on('store:set', (_event, name: string, value: string) => {
  if (!STORE_NAMES.has(name) || typeof value !== 'string') return
  const file = storePath(name)
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    // Through a temporary file, so a crash mid-write never leaves half a settings file
    writeFileSync(`${file}.tmp`, value, 'utf8')
    renameSync(`${file}.tmp`, file)
  } catch (error) {
    console.error(`Failed to save ${name}:`, error)
  }
})

ipcMain.on('store:remove', (_event, name: string) => {
  if (!STORE_NAMES.has(name)) return
  rmSync(storePath(name), { force: true })
})
