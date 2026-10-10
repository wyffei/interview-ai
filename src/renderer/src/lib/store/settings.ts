import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import techInterviewPrompt from './prompts/tech-interview.md?raw'
import behavioralInterviewPrompt from './prompts/behavioral-interview.md?raw'
import englishInterviewPrompt from './prompts/english-interview.md?raw'
import { DEFAULT_THEME, type Theme } from '../theme'
import { normalizeBaseURL, resolveLinkedModel, type ModelSwitchReason } from '../providers'
import { createProfile, type ApiProfile } from '../api-profiles'
import type { HintMode } from '../../../../shared/conversation'

export type { Theme }
export type { ApiProfile }
export type { HintMode }

export interface PromptScene {
  id: string
  name: string
  prompt: string
  isPreset: boolean
}

/** The scene to fall back to when the active one is gone */
export const TECH_INTERVIEW_SCENE_ID = 'tech-interview'

/** Default prompts for all preset scenes, maintained as Markdown files under ./prompts */
export const PRESET_SCENE_PROMPTS: Record<string, string> = {
  [TECH_INTERVIEW_SCENE_ID]: techInterviewPrompt,
  'behavioral-interview': behavioralInterviewPrompt,
  'english-interview': englishInterviewPrompt
}

const createPresetScenes = (): PromptScene[] => [
  {
    id: TECH_INTERVIEW_SCENE_ID,
    name: '技术面试',
    prompt: PRESET_SCENE_PROMPTS[TECH_INTERVIEW_SCENE_ID],
    isPreset: true
  },
  {
    id: 'behavioral-interview',
    name: '行为面试',
    prompt: PRESET_SCENE_PROMPTS['behavioral-interview'],
    isPreset: true
  },
  {
    id: 'english-interview',
    name: '英文面试',
    prompt: PRESET_SCENE_PROMPTS['english-interview'],
    isPreset: true
  }
]

/**
 * The scene list: the presets the user has not deleted, in their fixed order
 * and keeping edited prompts, then the user's own. A preset added in a later
 * version is not in `removed`, so it still reaches existing users.
 */
function assembleScenes(saved: PromptScene[], removed: string[]): PromptScene[] {
  return [
    ...createPresetScenes()
      .filter((p) => !removed.includes(p.id))
      .map((p) => {
        const kept = saved.find((s) => s.id === p.id)
        // An emptied (or restored) preset gets its default prompt back
        return kept?.prompt.trim() ? kept : p
      }),
    ...saved.filter((s) => !s.isPreset)
  ]
}

/** The system prompt main sends hints with, derived from the active scene */
function composePrompt(scenes: PromptScene[], sceneId: string): string {
  const scene = scenes.find((s) => s.id === sceneId)
  if (!scene) return PRESET_SCENE_PROMPTS[TECH_INTERVIEW_SCENE_ID]
  // An emptied preset scene falls back to its default prompt
  return scene.prompt.trim() || PRESET_SCENE_PROMPTS[scene.id] || ''
}

/** Whether any preset scene was deleted and can be restored */
export function hasRemovedPresets(removedIds: string[]): boolean {
  return createPresetScenes().some((p) => removedIds.includes(p.id))
}

/** Immutably replace one profile, leaving the rest untouched */
function patchProfile(
  profiles: ApiProfile[],
  id: string,
  patch: Partial<Omit<ApiProfile, 'id'>>
): ApiProfile[] {
  return profiles.map((p) => (p.id === id ? { ...p, ...patch } : p))
}

/** The live fields that are a mirror of the active profile */
const CREDENTIAL_KEYS = ['apiBaseURL', 'apiKey', 'apiHeaders', 'model', 'disableThinking'] as const

/** Same as `patchProfile`, but a no-op when `id` matches nothing */
function patchActiveProfile(
  profiles: ApiProfile[],
  id: string,
  patch: Partial<Omit<ApiProfile, 'id'>>
): ApiProfile[] {
  return profiles.some((p) => p.id === id) ? patchProfile(profiles, id, patch) : profiles
}

export const OPACITY_MIN = 0.1
export const OPACITY_MAX = 1
export const OPACITY_STEP = 0.05

interface Settings {
  /** Window colour scheme; `light` is a white background with dark text */
  theme: Theme
  /** Saved AI endpoints; the one being edited is mirrored onto the fields below */
  apiProfiles: ApiProfile[]
  /**
   * Which entry of `apiProfiles` the settings page edits. Not necessarily the
   * one in use, which is `conversationProfileId`
   */
  activeProfileId: string
  /** The profile hints are asked for with; text only, so a fast model suits it */
  conversationProfileId: string
  /**
   * Whether the user has ever saved an API key. The welcome dialog keys off
   * this rather than the live `apiKey`, so switching to a profile that is still
   * blank does not pop the dialog back up over what the user is doing.
   */
  hasConfiguredApi: boolean
  apiBaseURL: string
  /** API Base URL entries the user created from the picker, kept as a shortcut list */
  customBaseURLs: string[]
  apiKey: string
  /** Extra request headers, one `Name: Value` per line */
  apiHeaders: string
  model: string
  /** The active profile's 「关闭思考」 */
  disableThinking: boolean
  /** Custom models created before they were kept per API Base URL; offered for every URL */
  customModels: string[]
  /** Custom models the user created, keyed by normalized API Base URL */
  customModelsByBaseURL: Record<string, string[]>
  /** Last model used with each normalized API Base URL, restored when switching back */
  modelByBaseURL: Record<string, string>
  /** The system prompt, derived from `conversationSceneId` */
  conversationPrompt: string

  scenes: PromptScene[]
  conversationSceneId: string
  /** Preset scenes the user deleted; kept so the next load does not bring them back */
  removedPresetSceneIds: string[]

  opacity: number
  /** Allow resizing the main window and overlay toolbar */
  resizable: boolean
  /** Show the click-through overlay toolbar above the main window */
  showOverlayToolbar: boolean
  /** Dwell time in ms before hovering a toolbar button fires it; 0 disables hover triggering */
  toolbarHoverDelay: number

  dashscopeApiKey: string

  hideDockIcon: boolean

  audioInputDeviceId: string
  audioOutputDeviceId: string

  /** Hint as soon as the other side finishes a sentence, or only on the shortcut */
  conversationHintMode: HintMode
  /** Silence (ms) after which the recogniser ends a sentence; shorter hints sooner */
  conversationSilenceMs: number
  /** A finished sentence shorter than this (punctuation aside) triggers no automatic hint */
  conversationMinChars: number
  /** Hide the transcript column to give the hints the whole window */
  conversationTranscriptHidden: boolean
  /** 把每段对话自动保存为 Markdown 文件 */
  conversationAutoSave: boolean
  /** 对话记录保存目录；为空时用 文档/InterviewCoder */
  conversationSaveDir: string
}

/** A model change made on the user's behalf when the API Base URL changed */
export interface ModelSwitch {
  from: string
  to: string
  reason: ModelSwitchReason
}

interface SettingsStore extends Settings {
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** Change the API Base URL and carry the model over to the new platform's spelling */
  setApiBaseURL: (url: string) => ModelSwitch | null
  /** Change the model, remembering it for the current API Base URL */
  setModel: (model: string) => void
  /** Switch to another saved profile, carrying the live fields with it */
  setActiveProfile: (id: string) => void
  /** Add a profile, either blank or copied from the active one */
  addProfile: (name: string, copyActive?: boolean) => string
  /** Rename a profile */
  renameProfile: (id: string, name: string) => void
  /** Update one field of a profile; keeps the live fields in sync when it is active */
  updateProfile: (id: string, patch: Partial<Omit<ApiProfile, 'id'>>) => void
  /** Remove a profile; refuses to remove the last one */
  removeProfile: (id: string) => boolean
  /** Ask for hints with this profile */
  setConversationProfile: (id: string) => void
  /** Step to the next profile, for the keyboard shortcut. Null when there is nothing to step to */
  cycleProfile: (step?: number) => ApiProfile | null
  /** Record that an API key has been saved, so the welcome dialog stays away */
  markApiConfigured: () => void
  /**
   * Change one of the live credential fields, keeping the active profile's
   * own copy in step. Every settings-page input must go through this rather
   * than `updateSetting`, otherwise the edit lives only in the flat fields and
   * is lost the moment the user switches profiles or restarts.
   */
  updateCredential: (patch: Partial<Pick<ApiProfile, (typeof CREDENTIAL_KEYS)[number]>>) => void
  addCustomModel: (baseURL: string, model: string) => void
  removeCustomModel: (baseURL: string, model: string) => void
  /** Step the window opacity within [OPACITY_MIN, OPACITY_MAX] */
  adjustOpacity: (delta: number) => void
  syncSettings: (settings: Partial<Settings>) => void
  /** Make a scene the active one */
  setActiveScene: (id: string) => void
  /** Step to the next scene, wrapping at the end, and report its name */
  cycleScene: () => string
  updateScenePrompt: (id: string, prompt: string) => void
  addScene: (name: string) => string
  /** Delete a scene, preset or not; refuses to delete the last one */
  removeScene: (id: string) => boolean
  /** Bring back the deleted preset scenes, with their default prompts */
  restorePresetScenes: () => void
}

const defaultSettings: Settings = {
  theme: DEFAULT_THEME,
  // Seeded on rehydrate; the id must exist up front so the active profile resolves
  apiProfiles: [],
  activeProfileId: 'profile-default',
  // Filled in on rehydrate: starts out on the profile being edited
  conversationProfileId: '',
  hasConfiguredApi: false,
  apiBaseURL: '',
  customBaseURLs: [],
  apiKey: '',
  apiHeaders: '',
  model: '',
  disableThinking: false,
  customModels: [],
  customModelsByBaseURL: {},
  modelByBaseURL: {},
  conversationPrompt: PRESET_SCENE_PROMPTS[TECH_INTERVIEW_SCENE_ID],
  scenes: createPresetScenes(),
  conversationSceneId: TECH_INTERVIEW_SCENE_ID,
  removedPresetSceneIds: [],

  opacity: 0.8,
  resizable: true,
  showOverlayToolbar: true,
  toolbarHoverDelay: 1000,

  dashscopeApiKey: '',

  hideDockIcon: false,

  audioInputDeviceId: '',
  audioOutputDeviceId: '',

  conversationHintMode: 'auto',
  conversationSilenceMs: 800,
  conversationMinChars: 4,
  conversationTranscriptHidden: false,
  conversationAutoSave: false,
  conversationSaveDir: ''
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      updateSetting: (key, value) => {
        set({ [key]: value })
        // Setting a key from anywhere in the UI means the user is set up, so
        // the welcome dialog stays away from then on (see `hasConfiguredApi`)
        if (key === 'apiKey' && typeof value === 'string' && value.trim()) {
          set({ hasConfiguredApi: true })
        }
      },
      setApiBaseURL: (url) => {
        const state = get()
        const from = normalizeBaseURL(state.apiBaseURL)
        const to = normalizeBaseURL(url)
        if (from === to) {
          set({ apiBaseURL: url })
          return null
        }
        const modelByBaseURL = { ...state.modelByBaseURL }
        if (state.model) modelByBaseURL[from] = state.model
        const linked = resolveLinkedModel({
          model: state.model,
          baseURL: to,
          remembered: modelByBaseURL[to],
          customModels: state.customModelsByBaseURL[to] ?? []
        })
        const model = linked?.model ?? state.model
        if (model) modelByBaseURL[to] = model
        set({
          apiBaseURL: url,
          model,
          modelByBaseURL,
          apiProfiles: patchActiveProfile(state.apiProfiles, state.activeProfileId, {
            apiBaseURL: url,
            model
          })
        })
        return linked && linked.model !== state.model
          ? { from: state.model, to: linked.model, reason: linked.reason }
          : null
      },
      setModel: (model) => {
        set((state) => {
          const key = normalizeBaseURL(state.apiBaseURL)
          const modelByBaseURL = { ...state.modelByBaseURL }
          if (model) modelByBaseURL[key] = model
          else delete modelByBaseURL[key]
          // The active profile owns the value, so keep it in step
          return {
            model,
            modelByBaseURL,
            apiProfiles: patchActiveProfile(state.apiProfiles, state.activeProfileId, { model })
          }
        })
      },
      setActiveProfile: (id) => {
        set((state) => {
          const profile = state.apiProfiles.find((p) => p.id === id)
          if (!profile) return {}
          // Restore the profile's own model spelling for its platform
          return {
            activeProfileId: id,
            apiBaseURL: profile.apiBaseURL,
            apiKey: profile.apiKey,
            apiHeaders: profile.apiHeaders,
            model: profile.model,
            disableThinking: profile.disableThinking
          }
        })
      },
      addProfile: (name, copyActive = false) => {
        const state = get()
        const source = copyActive
          ? state.apiProfiles.find((p) => p.id === state.activeProfileId)
          : undefined
        const profile = createProfile({
          name,
          apiBaseURL: source?.apiBaseURL ?? '',
          apiKey: source?.apiKey ?? '',
          apiHeaders: source?.apiHeaders ?? '',
          model: source?.model ?? '',
          disableThinking: source?.disableThinking ?? false
        })
        // Only opened for editing: the profile hints use is left alone
        set({
          apiProfiles: [...state.apiProfiles, profile],
          activeProfileId: profile.id,
          apiBaseURL: profile.apiBaseURL,
          apiKey: profile.apiKey,
          apiHeaders: profile.apiHeaders,
          model: profile.model,
          disableThinking: profile.disableThinking
        })
        return profile.id
      },
      renameProfile: (id, name) => {
        set((state) => ({
          apiProfiles: patchProfile(state.apiProfiles, id, { name })
        }))
      },
      updateProfile: (id, patch) => {
        set((state) => {
          const apiProfiles = patchProfile(state.apiProfiles, id, patch)
          // Any key saved anywhere means the user is set up
          const configured =
            state.hasConfiguredApi ||
            (typeof patch.apiKey === 'string' && patch.apiKey.trim() !== '')
          // The active profile is mirrored onto the live fields the main
          // process reads, so editing it must update those too
          if (id !== state.activeProfileId) return { apiProfiles, hasConfiguredApi: configured }
          return {
            apiProfiles,
            hasConfiguredApi: configured,
            ...(patch.apiBaseURL !== undefined ? { apiBaseURL: patch.apiBaseURL } : {}),
            ...(patch.apiKey !== undefined ? { apiKey: patch.apiKey } : {}),
            ...(patch.apiHeaders !== undefined ? { apiHeaders: patch.apiHeaders } : {}),
            ...(patch.model !== undefined ? { model: patch.model } : {}),
            ...(patch.disableThinking !== undefined
              ? { disableThinking: patch.disableThinking }
              : {})
          }
        })
      },
      removeProfile: (id) => {
        const state = get()
        if (state.apiProfiles.length <= 1) return false
        const index = state.apiProfiles.findIndex((p) => p.id === id)
        if (index === -1) return false

        const apiProfiles = state.apiProfiles.filter((p) => p.id !== id)
        // Hints that used it hand over to its neighbour
        const next = apiProfiles[Math.min(index, apiProfiles.length - 1)]
        const modeProfiles = {
          conversationProfileId:
            state.conversationProfileId === id ? next.id : state.conversationProfileId
        }
        if (id !== state.activeProfileId) {
          set({ apiProfiles, ...modeProfiles })
          return true
        }
        // Removing the one being edited opens its neighbour instead
        set({
          apiProfiles,
          ...modeProfiles,
          activeProfileId: next.id,
          apiBaseURL: next.apiBaseURL,
          apiKey: next.apiKey,
          apiHeaders: next.apiHeaders,
          model: next.model,
          disableThinking: next.disableThinking
        })
        return true
      },
      setConversationProfile: (id) => {
        if (!get().apiProfiles.some((p) => p.id === id)) return
        set({ conversationProfileId: id })
      },
      cycleProfile: (step = 1) => {
        const state = get()
        const currentId = state.conversationProfileId
        const candidates = state.apiProfiles
        if (candidates.length < 2) return null
        const index = Math.max(
          0,
          candidates.findIndex((p) => p.id === currentId)
        )
        const count = candidates.length
        const next = candidates[(((index + step) % count) + count) % count]
        get().setConversationProfile(next.id)
        return next
      },
      markApiConfigured: () => {
        if (!get().hasConfiguredApi) set({ hasConfiguredApi: true })
      },
      updateCredential: (patch) => {
        set((state) => {
          const configured =
            state.hasConfiguredApi ||
            (typeof patch.apiKey === 'string' && patch.apiKey.trim() !== '')
          return {
            ...patch,
            hasConfiguredApi: configured,
            apiProfiles: patchActiveProfile(state.apiProfiles, state.activeProfileId, patch)
          }
        })
      },
      addCustomModel: (baseURL, model) => {
        set((state) => {
          const key = normalizeBaseURL(baseURL)
          const list = state.customModelsByBaseURL[key] ?? []
          if (list.includes(model) || state.customModels.includes(model)) return {}
          return {
            customModelsByBaseURL: { ...state.customModelsByBaseURL, [key]: [...list, model] }
          }
        })
      },
      removeCustomModel: (baseURL, model) => {
        set((state) => {
          const key = normalizeBaseURL(baseURL)
          const customModelsByBaseURL = { ...state.customModelsByBaseURL }
          const list = (customModelsByBaseURL[key] ?? []).filter((m) => m !== model)
          if (list.length > 0) customModelsByBaseURL[key] = list
          else delete customModelsByBaseURL[key]
          return {
            customModels: state.customModels.filter((m) => m !== model),
            customModelsByBaseURL
          }
        })
      },
      adjustOpacity: (delta) => {
        const raw = get().opacity + delta
        // Round to 2 decimals to avoid float drift across repeated presses
        const opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(raw * 100) / 100))
        set({ opacity })
      },
      syncSettings: (settings) => {
        set(settings)
        // Credentials filled in from main (.env) belong to the active profile too
        const credentials = Object.fromEntries(
          CREDENTIAL_KEYS.filter((key) => settings[key] !== undefined).map((key) => [
            key,
            settings[key]
          ])
        )
        if (Object.keys(credentials).length > 0) get().updateCredential(credentials)
      },
      setActiveScene: (id) => {
        set((state) => {
          if (!state.scenes.some((s) => s.id === id)) return {}
          return { conversationSceneId: id, conversationPrompt: composePrompt(state.scenes, id) }
        })
      },
      cycleScene: () => {
        const state = get()
        const scenes = state.scenes
        if (scenes.length === 0) return ''
        const activeId = state.conversationSceneId
        // An unknown active id starts over from the first scene
        const next = scenes[(scenes.findIndex((s) => s.id === activeId) + 1) % scenes.length]
        get().setActiveScene(next.id)
        return next.name
      },
      updateScenePrompt: (id, prompt) => {
        set((state) => {
          const scenes = state.scenes.map((s) => (s.id === id ? { ...s, prompt } : s))
          return {
            scenes,
            conversationPrompt: composePrompt(scenes, state.conversationSceneId)
          }
        })
      },
      addScene: (name) => {
        const id = `custom-${Date.now()}`
        set((state) => {
          const scenes: PromptScene[] = [...state.scenes, { id, name, prompt: '', isPreset: false }]
          return { scenes, conversationSceneId: id, conversationPrompt: composePrompt(scenes, id) }
        })
        return id
      },
      removeScene: (id) => {
        const state = get()
        const removed = state.scenes.find((s) => s.id === id)
        if (!removed) return false
        // One must remain, or there is nothing to pick and no prompt to edit
        if (state.scenes.length <= 1) return false

        const scenes = state.scenes.filter((s) => s.id !== id)
        // Removing the active scene hands over to its neighbour
        const index = state.scenes.findIndex((s) => s.id === id)
        const activeId =
          state.conversationSceneId === id
            ? scenes[Math.min(index, scenes.length - 1)].id
            : state.conversationSceneId
        set({
          scenes,
          conversationSceneId: activeId,
          conversationPrompt: composePrompt(scenes, activeId),
          // Presets are rebuilt on every load, so a deleted one must be remembered
          ...(removed.isPreset
            ? { removedPresetSceneIds: [...state.removedPresetSceneIds, id] }
            : {})
        })
        return true
      },
      restorePresetScenes: () => {
        set((state) => {
          const scenes = assembleScenes(state.scenes, [])
          return {
            scenes,
            removedPresetSceneIds: [],
            conversationPrompt: composePrompt(scenes, state.conversationSceneId)
          }
        })
      }
    }),
    {
      name: 'interview-coder-settings',
      version: 8,
      migrate: (persisted, version) => {
        const state = persisted as Partial<Settings>
        if (version < 8) {
          // Hover-delay options are now 0.5s / 1s / 2s; snap the retired ones
          // so the Select still matches an item
          if (state.toolbarHoverDelay === 800 || state.toolbarHoverDelay === 1200) {
            state.toolbarHoverDelay = 1000
          }
        }
        return state
      },
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<Settings>) }
        // Rebuild the presets on every load, so ones added in a later version
        // show up for existing users; the ones the user deleted stay out
        const persistedScenes = Array.isArray(state.scenes) ? state.scenes : []
        state.removedPresetSceneIds = Array.isArray(state.removedPresetSceneIds)
          ? state.removedPresetSceneIds
          : []
        state.scenes = assembleScenes(persistedScenes, state.removedPresetSceneIds)
        // Deleting refuses the last scene, but a hand-edited store could still
        // arrive without any; the presets are the only sensible offer then
        if (state.scenes.length === 0) {
          state.removedPresetSceneIds = []
          state.scenes = assembleScenes(persistedScenes, [])
        }
        if (!state.scenes.some((s) => s.id === state.conversationSceneId)) {
          state.conversationSceneId = state.scenes[0].id
        }
        state.conversationPrompt = composePrompt(state.scenes, state.conversationSceneId)
        state.apiProfiles = reconcileApiProfiles(state)
        // Until one is picked, hints use the profile being edited
        if (!state.apiProfiles.some((p) => p.id === state.conversationProfileId)) {
          state.conversationProfileId = state.activeProfileId
        }
        return state
      }
    }
  )
)

/**
 * Keep the profile list and the live API fields consistent after a rehydrate.
 *
 * Runs on every load, which covers all the cases at once: a fresh install (no
 * profiles yet), an upgrade from a version that had only the flat fields (adopt
 * them as the first profile, so nobody loses the key they already entered), and
 * an ordinary load (trust the stored list).
 */
function reconcileApiProfiles(state: Settings): ApiProfile[] {
  // Profiles saved before custom headers or the thinking switch existed carry neither
  const profiles = (Array.isArray(state.apiProfiles) ? state.apiProfiles : []).map((p) => ({
    ...p,
    apiHeaders: p.apiHeaders ?? '',
    disableThinking: p.disableThinking ?? false
  }))
  const active = profiles.find((p) => p.id === state.activeProfileId)

  if (profiles.length === 0) {
    const seeded: ApiProfile = {
      id: state.activeProfileId || 'profile-default',
      name: '配置1',
      apiBaseURL: state.apiBaseURL ?? '',
      apiKey: state.apiKey ?? '',
      apiHeaders: state.apiHeaders ?? '',
      model: state.model ?? '',
      disableThinking: false
    }
    state.activeProfileId = seeded.id
    state.hasConfiguredApi = !!seeded.apiKey.trim()
    return [seeded]
  }

  if (!active) {
    // The stored active id points nowhere (removed by hand, or restored from a
    // backup): fall back to the first profile rather than leaving nothing set
    const first = profiles[0]
    state.activeProfileId = first.id
    state.apiBaseURL = first.apiBaseURL
    state.apiKey = first.apiKey
    state.apiHeaders = first.apiHeaders
    state.model = first.model
    state.disableThinking = first.disableThinking
    state.hasConfiguredApi = hasAnyApiKey(profiles)
    return profiles
  }

  // Upgrades from before this flag existed: any saved key counts as configured,
  // so an existing user is never met by the welcome dialog again
  state.hasConfiguredApi = state.hasConfiguredApi || hasAnyApiKey(profiles)

  // The active profile owns the credentials and the flat fields are its mirror
  // — the ones the main process reads to send requests.
  // The profile wins, so the stored URL / key / model come back on restart.
  const resolved = {
    apiBaseURL: active.apiBaseURL || state.apiBaseURL,
    apiKey: active.apiKey || state.apiKey,
    model: active.model || state.model
  }
  state.apiBaseURL = resolved.apiBaseURL
  state.apiKey = resolved.apiKey
  state.model = resolved.model
  // Headers and the thinking switch came in with profiles, so no flat value
  // predates them to adopt
  state.apiHeaders = active.apiHeaders
  state.disableThinking = active.disableThinking

  // A profile saved before these fields existed adopts whatever the flat
  // fields held, so an upgrade never silently blanks the user's credentials
  const needsSeeding =
    active.apiBaseURL !== resolved.apiBaseURL ||
    active.apiKey !== resolved.apiKey ||
    active.model !== resolved.model

  return needsSeeding ? patchProfile(profiles, active.id, resolved) : profiles
}

/** Whether at least one profile has a usable API key */
function hasAnyApiKey(profiles: ApiProfile[]): boolean {
  return profiles.some((p) => (p.apiKey ?? '').trim() !== '')
}
