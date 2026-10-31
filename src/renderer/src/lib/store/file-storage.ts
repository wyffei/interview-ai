import { createJSONStorage } from 'zustand/middleware'

/**
 * Where the persisted stores live: a file per store under userData (main
 * store-file.ts), the same for the dev server and the installed app, so
 * neither an update nor switching builds changes what the user set. The first
 * time there is no file, this window's localStorage copy is adopted; it is
 * kept up to date as a mirror for older builds.
 */
export const fileStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    const saved = window.api.readStore(name)
    if (saved !== null) return saved
    try {
      const adopted = localStorage.getItem(name)
      // Written at once, not on the next change: until then another build
      // (the other origin) would adopt its own copy instead
      if (adopted !== null) window.api.writeStore(name, adopted)
      return adopted
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string) => {
    window.api.writeStore(name, value)
    try {
      localStorage.setItem(name, value)
    } catch {
      // The file is what counts
    }
  },
  removeItem: (name: string) => {
    window.api.removeStore(name)
    try {
      localStorage.removeItem(name)
    } catch {
      // The file is what counts
    }
  }
}))
