import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import techInterviewPrompt from './prompts/tech-interview.md?raw'
import behavioralInterviewPrompt from './prompts/behavioral-interview.md?raw'
import englishInterviewPrompt from './prompts/english-interview.md?raw'
import generalQaPrompt from './prompts/general-qa.md?raw'
import codingPrompt from './prompts/coding.md?raw'
import englishExamPrompt from './prompts/english-exam.md?raw'
import aptitudeTestPrompt from './prompts/aptitude-test.md?raw'
import { DEFAULT_THEME, type Theme } from '../theme'
import { normalizeBaseURL, resolveLinkedModel, type ModelSwitchReason } from '../providers'
import { createProfile, type ApiProfile } from '../api-profiles'
import { fileStorage } from './file-storage'
import type { HintMode } from '../../../../shared/conversation'
import type { CaptureRegion } from '../../../../shared/capture-region'

export type { Theme }
export type { ApiProfile }
export type { HintMode }

/** The two pages: hints for what is heard, or answers about screenshots */
export type AppMode = 'conversation' | 'screenshot'

export interface PromptScene {
  id: string
  name: string
  prompt: string
  isPreset: boolean
  /** The mode the scene belongs to; scenes saved without one are the hints' */
  mode?: AppMode
}

/** The scene to fall back to when the active one is gone */
export const TECH_INTERVIEW_SCENE_ID = 'tech-interview'
/** 截图模式's first scene, which a new install starts on */
export const GENERAL_QA_SCENE_ID = 'general-qa'

/** Default prompts for all preset scenes, maintained as Markdown files under ./prompts */
export const PRESET_SCENE_PROMPTS: Record<string, string> = {
  [TECH_INTERVIEW_SCENE_ID]: techInterviewPrompt,
  'behavioral-interview': behavioralInterviewPrompt,
  'english-interview': englishInterviewPrompt,
  [GENERAL_QA_SCENE_ID]: generalQaPrompt,
  coding: codingPrompt,
  'english-exam': englishExamPrompt,
  'aptitude-test': aptitudeTestPrompt
}

/** Each mode's fallback scene */
const DEFAULT_SCENE_ID: Record<AppMode, string> = {
  conversation: TECH_INTERVIEW_SCENE_ID,
  screenshot: GENERAL_QA_SCENE_ID
}

export function sceneMode(scene: PromptScene): AppMode {
  return scene.mode ?? 'conversation'
}

/** A mode's scenes, in list order */
export function scenesOf(scenes: PromptScene[], mode: AppMode): PromptScene[] {
  return scenes.filter((s) => sceneMode(s) === mode)
}

/** The store keys holding a mode's active scene and the prompt derived from it */
const SCENE_KEYS = {
  conversation: { sceneId: 'conversationSceneId', prompt: 'conversationPrompt' },
  screenshot: { sceneId: 'screenshotSceneId', prompt: 'screenshotPrompt' }
} as const

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
  },
  {
    id: GENERAL_QA_SCENE_ID,
    name: '通用问答',
    prompt: PRESET_SCENE_PROMPTS[GENERAL_QA_SCENE_ID],
    isPreset: true,
    mode: 'screenshot'
  },
  {
    id: 'coding',
    name: '解算法题',
    prompt: PRESET_SCENE_PROMPTS.coding,
    isPreset: true,
    mode: 'screenshot'
  },
  {
    id: 'english-exam',
    name: '英语考试',
    prompt: PRESET_SCENE_PROMPTS['english-exam'],
    isPreset: true,
    mode: 'screenshot'
  },
  {
    id: 'aptitude-test',
    name: '能力测评',
    prompt: PRESET_SCENE_PROMPTS['aptitude-test'],
    isPreset: true,
    mode: 'screenshot'
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
        // An emptied (or restored) preset gets its default prompt back. Its
        // mode always comes from the table, never from the saved copy
        return kept?.prompt.trim() ? { ...kept, mode: p.mode } : p
      }),
    ...saved.filter((s) => !s.isPreset)
  ]
}

/** The system prompt main sends a mode's requests with, derived from its active scene */
function composePrompt(scenes: PromptScene[], sceneId: string, mode: AppMode): string {
  const scene = scenes.find((s) => s.id === sceneId && sceneMode(s) === mode)
  if (!scene) return PRESET_SCENE_PROMPTS[DEFAULT_SCENE_ID[mode]]
  // An emptied preset scene falls back to its default prompt
  return scene.prompt.trim() || PRESET_SCENE_PROMPTS[scene.id] || ''
}

/** Both modes' prompts, recomputed after any change to the scene list */
function composePrompts(
  scenes: PromptScene[],
  conversationSceneId: string,
  screenshotSceneId: string
): { conversationPrompt: string; screenshotPrompt: string } {
  return {
    conversationPrompt: composePrompt(scenes, conversationSceneId, 'conversation'),
    screenshotPrompt: composePrompt(scenes, screenshotSceneId, 'screenshot')
  }
}

/** Whether any of a mode's preset scenes was deleted and can be restored */
export function hasRemovedPresets(removedIds: string[], mode: AppMode): boolean {
  return scenesOf(createPresetScenes(), mode).some((p) => removedIds.includes(p.id))
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
const CREDENTIAL_KEYS = [
  'apiBaseURL',
  'apiKey',
  'apiHeaders',
  'model',
  'disableThinking',
  'enableThinking'
] as const

/** Same as `patchProfile`, but a no-op when `id` matches nothing */
function patchActiveProfile(
  profiles: ApiProfile[],
  id: string,
  patch: Partial<Omit<ApiProfile, 'id'>>
): ApiProfile[] {
  return profiles.some((p) => p.id === id) ? patchProfile(profiles, id, patch) : profiles
}

/** Five levels: fully transparent, ¼, ½, ¾, fully opaque */
export const OPACITY_MIN = 0
export const OPACITY_MAX = 1
export const OPACITY_STEP = 0.25

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
  /** The profile 截图模式 sends screenshots with; its model has to take images */
  screenshotProfileId: string
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
  /** The active profile's 「开启思考」 */
  enableThinking: boolean
  /** Custom models created before they were kept per API Base URL; offered for every URL */
  customModels: string[]
  /** Custom models the user created, keyed by normalized API Base URL */
  customModelsByBaseURL: Record<string, string[]>
  /** Last model used with each normalized API Base URL, restored when switching back */
  modelByBaseURL: Record<string, string>
  /** The hints' system prompt, derived from `conversationSceneId` */
  conversationPrompt: string
  /** 截图模式's system prompt, derived from `screenshotSceneId` */
  screenshotPrompt: string

  scenes: PromptScene[]
  conversationSceneId: string
  screenshotSceneId: string
  /** Preset scenes the user deleted; kept so the next load does not bring them back */
  removedPresetSceneIds: string[]

  opacity: number
  /** Allow resizing the main window and overlay toolbar */
  resizable: boolean
  /** Dwell time in ms before hovering a toolbar button fires it; 0 disables hover triggering */
  toolbarHoverDelay: number

  dashscopeApiKey: string

  hideDockIcon: boolean

  /**
   * 手机面试模式: listen through `audioInputDeviceId` (a microphone near the
   * phone) instead of system audio. It hears the user too, so the user says who
   * is talking with the 我在说 / 对方在说 button
   */
  phoneMode: boolean
  /** In 手机面试模式, switch to 我在说 once a hint is out */
  phoneAutoMe: boolean
  /** The microphone 手机面试模式 listens through; blank = the system default */
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
  /** 面试准备: research the 行业卡片 with web search (see main briefing.ts) */
  briefingWebSearch: boolean
  /** 面试准备: what the self-introduction must be like; blank means DEFAULT_INTRO_PROMPT */
  briefingIntroPrompt: string
  /** 把每段对话自动保存为 Markdown 文件 */
  conversationAutoSave: boolean
  /** 对话记录保存目录；为空时用 文档/InterviewCoder */
  conversationSaveDir: string

  /** The mode page shown last, opened on the next start and by the back buttons */
  lastMode: AppMode
  /** 截图模式: crop every screenshot to this area of one screen; null for the whole screen */
  captureRegion: CaptureRegion | null
  /**
   * 截图模式: keep each question (read off the screenshots by the model), its
   * answer and a reason in a Markdown file in `conversationSaveDir`
   */
  screenshotAutoSave: boolean
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
  /** Send screenshots with this profile */
  setScreenshotProfile: (id: string) => void
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
  /** Step the window opacity one level up (`direction` > 0) or down, within [OPACITY_MIN, OPACITY_MAX] */
  adjustOpacity: (direction: number) => void
  syncSettings: (settings: Partial<Settings>) => void
  /** Make a scene its mode's active one */
  setActiveScene: (id: string) => void
  /** Step a mode to its next scene, wrapping at the end, and report its name */
  cycleScene: (mode?: AppMode) => string
  updateScenePrompt: (id: string, prompt: string) => void
  addScene: (name: string, mode?: AppMode) => string
  /** Delete a scene, preset or not; refuses to delete the last one of its mode */
  removeScene: (id: string) => boolean
  /** Bring back a mode's deleted preset scenes, with their default prompts */
  restorePresetScenes: (mode?: AppMode) => void
}

const defaultSettings: Settings = {
  theme: DEFAULT_THEME,
  // Seeded on rehydrate; the id must exist up front so the active profile resolves
  apiProfiles: [],
  activeProfileId: 'profile-default',
  // Filled in on rehydrate: starts out on the profile being edited
  conversationProfileId: '',
  // Filled in on rehydrate: starts out on the hints' profile
  screenshotProfileId: '',
  hasConfiguredApi: false,
  apiBaseURL: '',
  customBaseURLs: [],
  apiKey: '',
  apiHeaders: '',
  model: '',
  disableThinking: false,
  enableThinking: false,
  customModels: [],
  customModelsByBaseURL: {},
  modelByBaseURL: {},
  conversationPrompt: PRESET_SCENE_PROMPTS[TECH_INTERVIEW_SCENE_ID],
  screenshotPrompt: PRESET_SCENE_PROMPTS[GENERAL_QA_SCENE_ID],
  scenes: createPresetScenes(),
  conversationSceneId: TECH_INTERVIEW_SCENE_ID,
  screenshotSceneId: GENERAL_QA_SCENE_ID,
  removedPresetSceneIds: [],

  opacity: 0.75,
  resizable: true,
  toolbarHoverDelay: 1000,

  dashscopeApiKey: '',

  hideDockIcon: false,

  phoneMode: false,
  phoneAutoMe: true,
  audioInputDeviceId: '',
  audioOutputDeviceId: '',

  conversationHintMode: 'auto',
  conversationSilenceMs: 800,
  conversationMinChars: 4,
  conversationTranscriptHidden: false,
  briefingWebSearch: true,
  briefingIntroPrompt: '',
  conversationAutoSave: false,
  conversationSaveDir: '',

  lastMode: 'conversation',
  captureRegion: null,
  screenshotAutoSave: true
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
            disableThinking: profile.disableThinking,
            enableThinking: profile.enableThinking
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
          disableThinking: source?.disableThinking ?? false,
          enableThinking: source?.enableThinking ?? false
        })
        // Only opened for editing: the profile hints use is left alone
        set({
          apiProfiles: [...state.apiProfiles, profile],
          activeProfileId: profile.id,
          apiBaseURL: profile.apiBaseURL,
          apiKey: profile.apiKey,
          apiHeaders: profile.apiHeaders,
          model: profile.model,
          disableThinking: profile.disableThinking,
          enableThinking: profile.enableThinking
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
              : {}),
            ...(patch.enableThinking !== undefined ? { enableThinking: patch.enableThinking } : {})
          }
        })
      },
      removeProfile: (id) => {
        const state = get()
        if (state.apiProfiles.length <= 1) return false
        const index = state.apiProfiles.findIndex((p) => p.id === id)
        if (index === -1) return false

        const apiProfiles = state.apiProfiles.filter((p) => p.id !== id)
        // A mode that used it hands over to its neighbour
        const next = apiProfiles[Math.min(index, apiProfiles.length - 1)]
        const modeProfiles = {
          conversationProfileId:
            state.conversationProfileId === id ? next.id : state.conversationProfileId,
          screenshotProfileId:
            state.screenshotProfileId === id ? next.id : state.screenshotProfileId
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
          disableThinking: next.disableThinking,
          enableThinking: next.enableThinking
        })
        return true
      },
      setConversationProfile: (id) => {
        if (!get().apiProfiles.some((p) => p.id === id)) return
        set({ conversationProfileId: id })
      },
      setScreenshotProfile: (id) => {
        if (!get().apiProfiles.some((p) => p.id === id)) return
        set({ screenshotProfileId: id })
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
      adjustOpacity: (direction) => {
        // One level up or down. A value saved between levels (0.8 from the old
        // finer steps) is left alone until a press moves it to a level
        const level = Math.round(get().opacity / OPACITY_STEP) + Math.sign(direction)
        const opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, level * OPACITY_STEP))
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
          const scene = state.scenes.find((s) => s.id === id)
          if (!scene) return {}
          const mode = sceneMode(scene)
          const keys = SCENE_KEYS[mode]
          return { [keys.sceneId]: id, [keys.prompt]: composePrompt(state.scenes, id, mode) }
        })
      },
      cycleScene: (mode = 'conversation') => {
        const state = get()
        const scenes = scenesOf(state.scenes, mode)
        if (scenes.length === 0) return ''
        const activeId = state[SCENE_KEYS[mode].sceneId]
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
            ...composePrompts(scenes, state.conversationSceneId, state.screenshotSceneId)
          }
        })
      },
      addScene: (name, mode = 'conversation') => {
        const id = `custom-${Date.now()}`
        set((state) => {
          // The hints' scenes are saved without a mode, as they always were
          const scene: PromptScene = { id, name, prompt: '', isPreset: false }
          if (mode === 'screenshot') scene.mode = mode
          const scenes = [...state.scenes, scene]
          const keys = SCENE_KEYS[mode]
          return { scenes, [keys.sceneId]: id, [keys.prompt]: composePrompt(scenes, id, mode) }
        })
        return id
      },
      removeScene: (id) => {
        const state = get()
        const removed = state.scenes.find((s) => s.id === id)
        if (!removed) return false
        const mode = sceneMode(removed)
        const siblings = scenesOf(state.scenes, mode)
        // One must remain per mode, or there is nothing to pick and no prompt to edit
        if (siblings.length <= 1) return false

        const scenes = state.scenes.filter((s) => s.id !== id)
        const keys = SCENE_KEYS[mode]
        // Removing the active scene hands over to its neighbour in the same mode
        const index = siblings.findIndex((s) => s.id === id)
        const remaining = siblings.filter((s) => s.id !== id)
        const activeId =
          state[keys.sceneId] === id
            ? remaining[Math.min(index, remaining.length - 1)].id
            : state[keys.sceneId]
        set({
          scenes,
          [keys.sceneId]: activeId,
          [keys.prompt]: composePrompt(scenes, activeId, mode),
          // Presets are rebuilt on every load, so a deleted one must be remembered
          ...(removed.isPreset
            ? { removedPresetSceneIds: [...state.removedPresetSceneIds, id] }
            : {})
        })
        return true
      },
      restorePresetScenes: (mode = 'conversation') => {
        set((state) => {
          const presetIds = new Set(scenesOf(createPresetScenes(), mode).map((s) => s.id))
          const removedPresetSceneIds = state.removedPresetSceneIds.filter(
            (id) => !presetIds.has(id)
          )
          const scenes = assembleScenes(state.scenes, removedPresetSceneIds)
          return {
            scenes,
            removedPresetSceneIds,
            ...composePrompts(scenes, state.conversationSceneId, state.screenshotSceneId)
          }
        })
      }
    }),
    {
      name: 'interview-coder-settings',
      storage: fileStorage,
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
        // A microphone picked before the mode existed was listened through; keep it so
        if ((persisted as Partial<Settings> | undefined)?.phoneMode === undefined) {
          state.phoneMode = !!state.audioInputDeviceId
        }
        // Rebuild the presets on every load, so ones added in a later version
        // show up for existing users; the ones the user deleted stay out
        const persistedScenes = Array.isArray(state.scenes) ? state.scenes : []
        state.removedPresetSceneIds = Array.isArray(state.removedPresetSceneIds)
          ? state.removedPresetSceneIds
          : []
        state.scenes = assembleScenes(persistedScenes, state.removedPresetSceneIds)
        for (const mode of ['conversation', 'screenshot'] as const) {
          // Deleting refuses a mode's last scene, but a hand-edited store could
          // still arrive without any; its presets are the only sensible offer then
          if (scenesOf(state.scenes, mode).length === 0) {
            const presetIds = new Set(scenesOf(createPresetScenes(), mode).map((s) => s.id))
            state.removedPresetSceneIds = state.removedPresetSceneIds.filter(
              (id) => !presetIds.has(id)
            )
            state.scenes = assembleScenes(persistedScenes, state.removedPresetSceneIds)
          }
          const key = SCENE_KEYS[mode].sceneId
          const scenes = scenesOf(state.scenes, mode)
          if (!scenes.some((s) => s.id === state[key])) state[key] = scenes[0].id
        }
        Object.assign(
          state,
          composePrompts(state.scenes, state.conversationSceneId, state.screenshotSceneId)
        )
        state.apiProfiles = reconcileApiProfiles(state)
        // Until one is picked, hints use the profile being edited
        if (!state.apiProfiles.some((p) => p.id === state.conversationProfileId)) {
          state.conversationProfileId = state.activeProfileId
        }
        // and screenshots the hints' one, until the user picks one that takes images
        if (!state.apiProfiles.some((p) => p.id === state.screenshotProfileId)) {
          state.screenshotProfileId = state.conversationProfileId
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
    disableThinking: p.disableThinking ?? false,
    enableThinking: p.enableThinking ?? false
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
      disableThinking: false,
      enableThinking: false
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
    state.enableThinking = first.enableThinking
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
  state.enableThinking = active.enableThinking

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
