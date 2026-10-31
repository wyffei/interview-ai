import { app } from 'electron'
import { existsSync, readdirSync, renameSync, rmdirSync } from 'fs'
import { join } from 'path'

/**
 * The package was named interview-coder-cn until 1.2.0, and userData is named
 * after the package. Upstream (识屏 Shiping) was interview-coder-cn too, and on
 * its first start it renames `%APPDATA%\interview-coder-cn` to its own folder,
 * taking this app's settings and 资料库 with it. Under a name of its own this
 * app is out of its reach; the old folder is adopted here on the first start.
 *
 * Imported first by index.ts: nothing may open the userData folder before it
 * is settled.
 */
export const LEGACY_NAME = 'interview-coder-cn'

/**
 * The old folder is moved over on the first start under the new name. If that
 * fails (a copy of the old version still running holds a file), the old folder
 * is used where it is, and the move is tried again on the next start.
 */
export function adoptLegacyUserData(): void {
  const appData = app.getPath('appData')
  const userData = app.getPath('userData')
  // `--user-data-dir` (the run skill's driver) picks a folder of its own
  if (userData !== join(appData, app.name)) return
  const legacy = join(appData, LEGACY_NAME)
  if (legacy === userData || !existsSync(legacy)) return
  // Electron may create the new folder before this runs; it is empty unless
  // this version has started before
  if (existsSync(userData) && readdirSync(userData).length > 0) return
  try {
    if (existsSync(userData)) rmdirSync(userData)
    renameSync(legacy, userData)
  } catch (err) {
    console.error('Failed to move the old user data folder, using it in place:', err)
    app.setPath('userData', legacy)
  }
}

adoptLegacyUserData()
