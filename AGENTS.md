# AGENTS.md

## Project Overview

**语音面试助手** is a desktop application that listens to the other side of an online interview (system audio), recognises it sentence by sentence and shows short AI hints for answering, drawing on the user's resume and 复盘库 (prepared interview material). It is a fork of interview-coder-cn. The window is invisible to screen-sharing software.

Key capabilities:
- Real-time speech recognition of system audio (DashScope Fun-ASR); a finished sentence asks for a hint at once, or the shortcut does
- 复盘库 search: material cut into entries by heading; a prepared answer to the very question is shown without asking the model, close ones are adapted by the model, and only the entries that fit go along with a request
- 资料库: the user's own material (resume, prepared Q&A, notes; imported from PDF / Word / Markdown / TXT or pasted), sent whole in front of the system prompt or searched per question
- Frameless, transparent, always-on-top overlay window invisible to screen-sharing; mouse passthrough; an overlay toolbar for mouse-driven actions
- Configurable AI provider (OpenAI, SiliconFlow, OpenRouter, DeepSeek, or any OpenAI-compatible API), several saved profiles, prompt scenes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 37 (electron-vite 4) |
| Frontend | React 19, TypeScript 5.8 |
| Styling | Tailwind CSS v4, shadcn/ui (New York style), Radix primitives |
| State | Zustand 5 (5 stores, 2 with localStorage persistence) |
| Routing | react-router v7 (HashRouter: `/` the conversation page, `/settings`, `/help`, plus `/toolbar` for the toolbar window) |
| AI | Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`), streaming via `streamText()` |
| Build | electron-vite (Vite 7), electron-builder 25 |
| Linting | ESLint 9 (flat config), Prettier |

## Directory Structure

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # App entry: lifecycle, error handling, app.whenReady()
│   ├── main-window.ts       # BrowserWindow creation (frameless, transparent, always-on-top)
│   ├── toolbar-window.ts    # Overlay toolbar window: bounds/visibility/opacity glued to main window
│   ├── shortcuts.ts         # Global shortcuts: window show/hide and top-most handling, click-through, the actions they and the toolbar trigger
│   ├── conversation.ts      # The conversation: utterances, hint cards, automatic / manual hint triggering, 复盘库 lookup per hint
│   ├── stream.ts            # consumeStream() (answer and reasoning chunks), API error messages
│   ├── ai.ts                # Vercel AI SDK integration: getHintStream() with the conversation profile
│   ├── knowledge.ts         # 资料库: material on disk under userData, IPC, the system prompt block, 复盘库 search
│   ├── knowledge-parse.ts   # Text out of an imported PDF (unpdf) / .docx (mammoth) / Markdown / TXT (UTF-8, UTF-16, GBK)
│   ├── docx-markdown.ts     # mammoth's HTML → Markdown (headings as `#`, bold, lists, table rows); no imports
│   ├── thinking.ts          # 「关闭思考」: per-platform request-body fields + retry without them when refused
│   ├── model-list.ts        # `listModels` IPC: a platform's `/models` list
│   ├── settings.ts          # App settings object + IPC handlers
│   ├── state.ts             # App state object + IPC handlers
│   ├── save-conversation.ts # The conversation → one Markdown file per conversation
│   ├── transcription.ts     # DashScope WebSocket real-time speech-to-text, each sentence revision handed to conversation.ts
│   ├── window-resize.ts     # Cursor-tracking resize for the frameless windows
│   ├── auto-updater.ts      # electron-updater (non-macOS only)
│   └── index.d.ts           # global.mainWindow type declaration
├── preload/
│   ├── index.ts             # contextBridge API: exposes window.api to renderer
│   └── index.d.ts           # Type declarations for window.electron and window.api
├── shared/                  # Pure TS used by both main and renderer (no Electron / DOM / Node imports)
│   ├── request-headers.ts   # Parse the custom request headers text, merge it over the Bearer key
│   ├── api-profile.ts       # ApiProfile type, DEFAULT_API_BASE_URL
│   ├── knowledge.ts         # KnowledgeDoc type (+ `use`: full / search), the suggested limit, estimateTokens()
│   ├── review-search.ts     # 复盘库 search: material cut into entries by heading, title matching, BM25, direct / adapt / none tiers; no imports
│   └── conversation.ts      # Conversation types (Utterance, HintCard, HintMode) + countMeaningfulChars()
└── renderer/
    ├── index.html            # SPA entry
    └── src/
        ├── main.tsx          # React root render
        ├── App.tsx           # Router + settings sync + shortcut init + Toaster
        ├── toolbar/OverlayToolbar.tsx # Contents of the toolbar window (route `/toolbar`)
        ├── conversation/     # The main page (`/`)
        │   ├── index.tsx     # Layout + snapshot / event sync with main's conversation
        │   ├── PrerequisitesChecker.tsx # Welcome dialog for the first API key
        │   ├── TranscriptPanel.tsx # The other side's sentences; a hovered hint highlights its own
        │   ├── HintPanel.tsx       # Hint cards + empty states
        │   └── listening.ts  # Start / stop recognition, toggle hint mode
        ├── settings/         # Settings page: left nav, one group at a time (`?tab=`)
        │   ├── index.tsx     # Shell: nav (出提示 / AI 模型 / 资料库 / 语音 / 界面与隐私 / 快捷键)
        │   ├── sections/     # One component per nav entry
        │   ├── components.tsx      # SettingsCard, Field, SaveDirField, Advanced (folded), SecretInput
        │   ├── SceneEditor.tsx     # Prompt scenes: pick, edit, add, delete, restore
        │   ├── ProfileSelect.tsx     # Which saved profile hints are asked for with
        │   ├── KnowledgeField.tsx  # What the 资料库 contributes to hints, linking to it
        │   ├── ApiProfiles.tsx     # Saved AI profiles: open, add, rename, remove, use for hints (「用于」)
        │   ├── ModelField.tsx      # Model row: picker + mismatch warning with one-click fix
        │   ├── ApiHeadersField.tsx # Custom request headers textarea + ignored-line warning
        │   ├── SelectModel.tsx     # Model combobox that follows the API Base URL
        │   ├── SelectBaseURL.tsx   # API Base URL combobox (presets from lib/providers.ts)
        │   └── CustomShortcuts.tsx # Shortcut key recorder
        ├── help/             # Help page
        │   ├── index.tsx     # Quick start guide, shortcuts, toolbar, FAQ
        │   ├── Shortcuts.tsx
        │   ├── OverlayToolbar.tsx  # Toolbar section (buttons + meanings + shortcuts)
        │   ├── FAQ.tsx
        │   └── components/index.tsx  # HelpSection wrapper
        ├── components/
        │   ├── AppHeader.tsx          # Draggable title bar: title, scene · model, settings / help / close
        │   ├── MarkdownRenderer.tsx   # react-markdown + remark-gfm + rehype-highlight + KaTeX math
        │   ├── ShortcutRenderer.tsx   # Platform-aware shortcut key badges
        │   ├── WindowResizeHandles.tsx # Edge/corner drag targets that drive window-resize.ts
        │   └── ui/           # shadcn/ui primitives (button, dialog, select, etc.)
        ├── lib/
        │   ├── store/        # Zustand stores
        │   │   ├── app.ts       # ignoreMouse / inConversationPage, synced from main process
        │   │   ├── conversation.ts # The page's copy of main's utterances + hint cards
        │   │   ├── settings.ts  # API config, model, prompt scenes, opacity, toolbar (persisted v8)
        │   │   ├── shortcuts.ts # Shortcut bindings (persisted v5, with migration)
        │   │   └── transcription.ts # isTranscribing
        │   ├── toolbar-actions.ts # Toolbar buttons (action + icon + label), shared with help
        │   ├── use-main-page.ts   # useMainPage(): page state to main, opacity, profile / scene shortcuts; HOME_PATH
        │   ├── providers.ts  # Known platforms + each one's spelling of the same model
        │   ├── platform-models.ts # usePlatformModels(): cached `/models` list per URL + key
        │   ├── model-switch.ts    # changeApiBaseURL(): switch URL, toast the linked model change
        │   ├── knowledge.ts       # useKnowledgeDocs() (the list from main), usage, 字 / token formatting
        │   ├── api-profiles.ts    # ApiProfile type + factory (one saved URL / key / model set)
        │   ├── utils/
        │   │   ├── index.ts     # cn() helper, getCloneableFields()
        │   │   ├── env.ts       # isMac, platformAlt
        │   │   └── keyboard.ts  # Accelerator string conversion
        │   └── audio-capture.ts # System audio capture via getDisplayMedia for transcription
        └── assets/
            ├── base.css      # Tailwind @import, CSS variables, app layout styles
            └── main.css      # Tailwind + typography plugin + theme variables (oklch)
```

## Architecture

### Process Model

```
┌─────────────────────────────────────────────────────┐
│  Main Process (src/main/)                           │
│  shortcuts.ts   window handling, global hotkeys     │
│  transcription.ts ──sentences──► conversation.ts    │
│                       knowledge.ts ◄─┘   │          │
│                       (复盘库 search)      ▼          │
│                                       ai.ts         │
│              IPC (ipcMain.handle / webContents.send)│
├─────────────────────────────────────────────────────┤
│  Preload (src/preload/)                             │
│  contextBridge → window.api                         │
├─────────────────────────────────────────────────────┤
│  Renderer (src/renderer/)                           │
│  React app with Zustand stores                      │
│  window.api.on*() for events from main              │
│  window.api.*() for invoke calls to main            │
└─────────────────────────────────────────────────────┘
```

### Data Flow: Speech → Hint

1. The renderer captures system audio (`getDisplayMedia`), downsamples it to 16kHz PCM and streams it to main
2. `transcription.ts` relays it to DashScope and hands every sentence revision to `conversation.ts`
3. A finished sentence (automatic mode) or the shortcut starts a hint card: `startHint()` searches the 复盘库 first (`searchKnowledge()`)
4. A prepared answer to the very question is put on the card at once; otherwise `getHintStream()` streams the model's hint, with the entries found in the user message
5. Main publishes the card (`conversation-hint`) and its chunks (`conversation-hint-chunk`); the page renders them as cards

### IPC Channels

**Renderer → Main (invoke):**
- `getAppSettings` / `updateAppSettings` — settings CRUD
- `listModels` — fetch the model list of an OpenAI-compatible platform (runs in main to avoid CORS)
- `updateAppState` / `getAppState` — sync `inConversationPage`, `inSettingsPage`; the toolbar window fetches it on load
- `setIgnoreMouse` — set click-through from the settings page switch
- `initShortcuts` / `getShortcuts` / `updateShortcuts` — shortcut management
- `triggerAction` / `setToolbarVisible` — overlay toolbar: run a shortcut action, toggle the window
- `selectConversationDir` — folder picker for saving conversations
- `window-resize-start` / `window-resize-stop` (`send`, not `invoke`) — begin/end a cursor-tracked window resize
- `start-transcription` / `stop-transcription` — speech transcription lifecycle; start takes `{ maxSentenceSilence }`
- `conversation:get-snapshot` / `conversation:request-hint` / `conversation:stop-hints` / `conversation:clear` / `conversation:set-note` / `conversation:submit-note` — the conversation
- `knowledge:list` / `knowledge:get-text` / `knowledge:pick-files` / `knowledge:import-files` / `knowledge:create` / `knowledge:update` / `knowledge:reimport` / `knowledge:remove` — 资料库; imports and reimports return their failures as values, not rejections

**Main → Renderer (send):**
- `sync-app-state` — push state changes (e.g., mouse ignore toggle) to both the main and the toolbar window
- `adjust-opacity` — step the window opacity; the renderer store owns it
- `switch-api-profile` — step the AI profile hints use (`1` / `-1`); the list lives in the renderer store
- `cycle-scene` — step to the next prompt scene; the renderer owns the list and syncs the new prompt back
- `toggle-hint-mode` — flip between automatic and manual hints; the renderer owns the setting
- `conversation-utterance` / `conversation-utterance-removed` / `conversation-hint` / `conversation-hint-chunk` / `conversation-cleared` / `conversation-notice` — conversation state from main
- `thinking-unsupported` — the active model refused 「关闭思考」 (model name); sent once per model per session, the request has already been resent without it
- `scroll-page-up` / `scroll-page-down` — keyboard-driven scroll
- `toggle-transcription` — trigger start/stop transcription from shortcut
- `sync-toolbar-settings` — push toolbar-only settings (hover dwell) into the toolbar window
- `sync-toolbar-status` — push listening / hint mode into the toolbar window, whose buttons show them (`getToolbarStatus` fetches it on load)
- `transcription-error` / `transcription-stopped` — transcription events

### Zustand Stores

| Store | File | Persisted | Key State |
|-------|------|-----------|-----------|
| `useSettingsStore` | `lib/store/settings.ts` | Yes (v8) | `apiProfiles`, `activeProfileId` (the one being edited), `conversationProfileId` (the one hints use), `hasConfiguredApi`, `apiBaseURL`, `apiKey`, `apiHeaders`, `model`, `disableThinking` (mirror of the edited profile), `customModels`, `customModelsByBaseURL`, `modelByBaseURL`, `scenes` (prompt scenes), `conversationSceneId`, `conversationPrompt` (derived from the scene), `conversationHintMode`, `conversationSilenceMs`, `conversationMinChars`, `conversationTranscriptHidden`, `conversationAutoSave`, `conversationSaveDir`, `opacity`, `resizable`, `showOverlayToolbar`, `toolbarHoverDelay`, `dashscopeApiKey` |
| `useShortcutsStore` | `lib/store/shortcuts.ts` | Yes (v5) | `shortcuts` (action → key mapping with categories); `merge` adds new default actions on every load and drops removed ones, so a new shortcut needs no `version` bump |
| `useTranscriptionStore` | `lib/store/transcription.ts` | No | `isTranscribing` |
| `useConversationStore` | `lib/store/conversation.ts` | No | `utterances`, `hints`, `errorMessage`, `focusedHintId` |
| `useAppStore` | `lib/store/app.ts` | No | `ignoreMouse`, `inConversationPage` |

Settings are bidirectionally synced: renderer persists to localStorage, and on mount syncs to main process via `updateAppSettings()`. Main process `.env` values serve as initial defaults only.

Adding a settings key needs no `version` bump: zustand shallow-merges the persisted object over the defaults, so a key missing from localStorage falls back to its default. Bump `version` only when an existing key changes shape or meaning.

## Key Patterns & Conventions

### Window Stealth

The app is designed to be invisible to screen-sharing software:
- `BrowserWindow` options: `transparent: true`, `frame: false`, `skipTaskbar: true`
- `setContentProtection(true)` prevents screen capture of the window itself
- `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })`
- `keepWindowInFront()` repeatedly reasserts always-on-top for 5 seconds after show
- `showInactive()` on macOS/Windows to avoid stealing focus

### Overlay Toolbar

A second `BrowserWindow` (`src/main/toolbar-window.ts`) that renders the `/toolbar` route, so the shortcut actions can be driven with the mouse instead of the keyboard:
- Owns its own visibility state: the renderer calls `setToolbarVisible()` (main page + `showOverlayToolbar` setting), main additionally requires the main window to be visible. Never call `showInactive()` on it directly — go through `showToolbar()` / `hideToolbar()`.
- `focusable: false` so clicking a button never pulls focus away from the app underneath
- Opacity is applied at the window level to match the main window, which applies its own via `document.body.style.opacity`
- It is a separate renderer process, so its Zustand store is a **separate copy** that does not see changes made in the main window. Settings it needs must be pushed from main (`sync-toolbar-settings`), not read from the store.
- Buttons carry no `title`: native tooltips are drawn outside the window and are not covered by content protection
- It never receives a `click` on Windows: `focusable: false` makes Chromium answer the press's WM_MOUSEACTIVATE with `MA_NOACTIVATEANDEAT`, so the button-down is dropped by the OS. Only the release and the moves arrive — anything interactive in this window must hang off `mouseup`/`pointermove`, never `click` or `pointerdown`
- `TOOLBAR_ACTIONS` (`lib/toolbar-actions.ts`) drives both the toolbar and its help page section. `triggerAction` is validated against `clickableActions` in `shortcuts.ts`
- Each button is an icon with a short `text` beside it, no shortcut; listening, 自动/手动 and click-through show their current state. The main page has no button bar of its own — this toolbar and the shortcuts are the controls
- Resizing the toolbar window never rescales its buttons: `OverlayToolbar` measures the bar and hides (`invisible`) the actions that do not fit, from the end

### Window Resizing

Both windows are created with `resizable: false` — toggling Electron's native resizable style breaks transparency on Windows — so resizing is implemented by hand:
- `WindowResizeHandles` renders eight fixed-position edge/corner divs — or, with `axis="x"`, just the two side edges — and sends only `window-resize-start` (pointerdown) and `window-resize-stop`
- `nonActivating` (the toolbar) also starts the drag from the first pointermove made with the button held, because Windows never delivers that window's pointerdown (see Overlay Toolbar)
- `src/main/window-resize.ts` then polls `screen.getCursorScreenPoint()` and calls `setBounds()`. The cursor is sampled in main because the toolbar is a non-activating panel on macOS and never receives a drag's pointer moves
- The drag is ended by a `window`-level `pointerup`/`pointercancel`/`blur` listener, with a 30s safety timeout in main as the last resort
- The handles sit at `z-index: 2147483647`; anything flush against a window edge (e.g. `#app-header .actions`) must raise itself above them or it becomes unclickable
- The main window's handles are gated by the `resizable` setting; the toolbar's are always on but width-only (`axis="x"` — its height is the button row), with the resize cursor suppressed in `main.css`

### AI Integration

- All AI calls go through `src/main/ai.ts` using Vercel AI SDK's `streamText()`
- Provider: `@ai-sdk/openai-compatible` with custom `baseURL` (works with any OpenAI-compatible API; an empty one means OpenAI, `DEFAULT_API_BASE_URL`). Not `@ai-sdk/openai`: its chat-completions parser drops the `reasoning_content` / `reasoning` deltas thinking models send
- Custom request headers (`apiHeaders`, one `Name: Value` per line) go on every AI request and on the `/models` fetch, through `buildRequestHeaders()` in `src/shared/request-headers.ts`. They override the Bearer key case-insensitively, so a gateway can replace `Authorization`
- Model fallback when a profile has none: `Qwen/Qwen3-VL-32B-Instruct` for SiliconFlow, `gpt-5-mini` otherwise
- AI profiles (`apiProfiles`): each holds its own URL / key / headers / model / thinking switch. Hints are requested with `conversationProfileId` (picked in the 出提示 settings group or via 「用于」); main resolves it with `getHintProfile()` in `settings.ts`. `activeProfileId` is only the profile open in the AI 模型 editor, mirrored onto the flat `apiBaseURL` / `apiKey` / `apiHeaders` / `model` / `disableThinking` fields the editor binds to (`CREDENTIAL_KEYS`). The profile is authoritative (`reconcileApiProfiles()` restores the flat fields from it on load), so never write those with `updateSetting`: use `updateCredential()`, `changeApiBaseURL()` or `setModel()`, which keep the profile in step — otherwise the edit is lost on the next profile switch or restart
- The welcome dialog (`PrerequisitesChecker`) shows only until a key has ever been saved (`hasConfiguredApi`), so a hint asked for with a blank profile key is reported on its card instead
- Model ↔ API Base URL linkage lives in the renderer (`lib/providers.ts`): each platform spells the same model differently (`deepseek-flash` vs `deepseek/deepseek-v4.1-flash`), so the picker lists the selected platform's spelling and `setApiBaseURL()` translates the model on switch (else restores the one last used with that URL, else the platform default). Change the API Base URL through `changeApiBaseURL()`, not `updateSetting`, so the model follows and the user gets an undo toast.
- System prompts are maintained in the renderer settings store (`PRESET_SCENE_PROMPTS` in `lib/store/settings.ts`) as "prompt scenes". The active scene's prompt is synced to main as `conversationPrompt`
- Preset scenes can be deleted too (at least one scene always remains). `merge` rebuilds the presets on every load so new ones reach existing users, so a deleted preset's id goes into `removedPresetSceneIds` and is skipped; 「恢复预设场景」 (`restorePresetScenes()`) brings them back with default prompts
- The system prompt is read per request, so switching scenes (`cycleScene` shortcut / toolbar) applies from the next hint; one already streaming keeps its prompt. The header shows `scene · model`, since a shortcut or a toolbar hover can switch it unnoticed
- Reasoning: `ai.ts` turns `fullStream` into `StreamChunk`s tagged `reasoning` or `text` (`stream.ts`); a card keeps it (`HintCard.reasoning`) and shows it once the card is published, not per chunk
- 「关闭思考」 (`disableThinking`, per profile, off by default): the SDK has no field for it and every platform spells it differently, so `createThinkingOffFetch()` in `thinking.ts` wraps `fetch` and merges the fields into the request body — OpenRouter `reasoning: { enabled: false }`, OpenAI host or a `gpt-`/`o<n>` model name `reasoning_effort: 'none'`, everyone else both `thinking: { type: 'disabled' }` and `enable_thinking: false`. OpenAI rejects any unknown field, and thinking-only models reject the switch, so a 400/422 whose body mentions thinking/reasoning is resent without the fields and that base URL + model is remembered for the session. The switch never makes a request fail; at worst it costs one extra round trip

### Conversation and Hints

`/` turns what the other side of a call says into hints. Main owns the conversation (`src/main/conversation.ts`); the page shows a copy, fetched with `conversation:get-snapshot` on mount and kept current by events, so visiting the settings mid-call loses nothing:
- Recognition runs with `max_sentence_silence: conversationSilenceMs`; `transcription.ts` hands every sentence revision to `conversation.ts`. Listening keeps running on the settings / help pages
- It is meant for system audio: in an online call that is only the other side, so a finished sentence can trigger a hint without speaker detection
- Automatic (`conversationHintMode: 'auto'`): a finished sentence with at least `conversationMinChars` meaningful characters asks for a hint at once, covering every sentence since the last hint. If the other side keeps talking (a new sentence reaches the minimum while the automatic hint streams) the hint is withdrawn (`waiting`) and rewritten into the same card when they finish — or when that sentence comes to nothing, or listening stops
- Shortcut / button (`generateHint`, automatic or manual): brings the card being written or waiting up to date, else opens one for everything not yet hinted (a sentence still being spoken included), else rewrites the last hint with 「换一个角度」
- Several cards may stream at once. A card restarted by a newer request bumps its `generations` entry, so the stream it replaced never writes to it again
- The hint panel scrolls each new card to its top and does not follow the stream. The newest card keeps a panel's height of room under it (`last:min-h-full`), else a short one stops at the bottom edge showing one line. A finished card that runs past the bottom pages down once by itself (`revealRest()`), unless the user scrolled since: paging by hand is easy to spot on a call
- Each request sends the recent sentences as context (20 sentences / 1500 chars) plus the ones the hint is for; earlier hints are not sent back, so requests stay small
- Note box under the hint panel (`note`): what the user types (a company name the recogniser gets wrong, the project being asked about) goes into every request as 【用户补充的说明】 and into the 复盘库 search's related ranking (not its title match). Kept in main, dropped by a clear. Enter (`submitNote()`) never writes over a hint on screen, unlike the shortcut: it opens a new card for what is not yet hinted, else for the last hint's question with the note in mind (a withdrawn `waiting` card is simply restarted)
- A bare number in it answers the 「（可确认：……）」 line the latest such hint ended with: a new card answers that question for the option picked (numbered, or split on 「还是」 for prompts saved before the numbering) and the number leaves the box
- A conversation (one interview) runs from the first sentence heard to 「清空对话」; starting / stopping listening does not split it
- The preset prompts ask for 「（无需回应）」 (`NO_REPLY`) when nothing needs an answer; the page dims those cards
- 复盘库 lookup: before a hint is requested, `startHint()` searches the 资料库's searched docs (`searchKnowledge()` in `knowledge.ts`) with what the hint is for. `direct` (one entry's title fits the question, `DIRECT_SCORE`) puts that entry's text on the card at once and asks no model — not for 「换一个角度」, which wants the model's take. `adapt` (a close title, or several equally good ones such as a self-introduction per company) and `none` send the entries found inside the user message (`materialBlock()`, `MATERIAL_CHARS` in all), not the system prompt, so the cached prefix stays the same. The card's `review` records the tier and source for the badge; `none` shows 「未准备」, since personal experience in such a hint may be made up
- 「保存对话记录到本地」 (`conversationAutoSave`, off by default): `save-conversation.ts` writes the whole conversation as Markdown to `对话记录_<start time>.md` in `conversationSaveDir` (blank = Documents/InterviewCoder), rewritten 1.5s after a change. A clear starts a new file, a pending save is flushed on clear and (synchronously) on `will-quit`, and turning it on mid-conversation saves what is there through `onSettingsChanged()`. Failed / withdrawn / 「（无需回应）」 hints are left out

### 资料库 (Knowledge)

Material the user wants the AI to draw on — a resume, prepared Q&A, notes — kept by main (`src/main/knowledge.ts`), not by the renderer store:
- Stored under `userData/knowledge/`: `index.json` for the list, `<id>.txt` per text, both cached in memory once read. Not in localStorage: a few documents would outgrow it, and settings are synced to main whole on every change
- Only the extracted text is kept, and the user can edit it (a PDF's layout often needs it); `sourcePath` is remembered for 「重新导入」, which overwrites those edits
- A doc can be switched off (`disabled`, absent = used). `getKnowledgePrompt()` wraps the used full docs in `<资料 name="…">` blocks with the rules for using them, and `getSystemPrompt()` in `ai.ts` puts that **before** the scene prompt: a prefix stable across requests and scene switches is what platforms cache, and the scene's format rules end up closer to the question
- Each doc is used `full` (sent with every request; the default, and what docs saved before the field existed get) or `search` (按题检索: 复盘库, 题库). Imports over `KNOWLEDGE_SEARCH_SUGGESTED_CHARS` start as `search`. Searched docs are left out of `getKnowledgePrompt()`, cut into entries by `parseReviewDoc()` (cached per doc and `updatedAt`) and searched per question. `sections` (how many entries) is worked out whenever main hands a doc over (`withStats()`), never saved
- Full docs are sent whole with every request. `KNOWLEDGE_CHAR_LIMIT` (30,000 chars) only drives a warning in the settings page, counting full docs only; a request that still overflows the model is explained by `extractErrorMessage()`
- Parsers (`unpdf`, `mammoth`) are loaded with `import()` on first use. PDF text is passed through NFKC for the Kangxi radical look-alikes (「⼩」 for 「小」) some fonts map to
- A .docx is imported as Markdown (`mammoth.convertToHtml` → `docxHtmlToMarkdown()`), not raw text: Word's heading styles are what the 复盘库 search cuts by. Docs imported before keep their plain text until 「重新导入」; the settings row warns when a searched doc yields fewer than 3 entries
- The settings section is also a drop zone (`webUtils.getPathForFile`, exposed as `getPathForFile`); while it is mounted, a file dropped elsewhere in the window is swallowed instead of replacing the app

### Stream Abort Pattern

- Each hint stream has its own `AbortController` (`streams` in `conversation.ts`); a card restarted by a newer request bumps its `generations` entry so the stream it replaced never writes to it again
- `stopHints()` (shortcut / button) aborts every streaming card and marks it `stopped`

### Real-time Speech Transcription

- Uses DashScope (Alibaba Cloud) Fun-ASR real-time ASR via WebSocket (`src/main/transcription.ts`)
- Requires a separate `dashscopeApiKey` configured in settings
- Audio is captured in the renderer via `getDisplayMedia()` (system audio), downsampled to 16kHz PCM, and streamed to main process via IPC
- Every sentence revision goes to `conversation.ts` (`onConversationSentence`)
- `toggleTranscription` starts / stops listening; `clearTranscription` clears the whole conversation

### Shortcut System

- Global shortcuts registered via Electron's `globalShortcut` API
- Renderer stores shortcut config in Zustand (persisted); sends to main on init
- On Windows, `Alt`-based shortcuts also register `Ctrl+Alt` variant for compatibility
- Shortcut actions are string-keyed callbacks in `shortcuts.ts`
- Default shortcuts use `platformAlt` (`Alt` on macOS, `CommandOrControl` on Windows)
- New actions also need a label in `settings/CustomShortcuts.tsx` and a description in `help/Shortcuts.tsx`
- Categories: `Window Management`, `Conversation` (hints), `AI` (stop, profile, scene, listening), `Navigation`, `Window Movement`. Only the key of a stored binding is the user's; `merge` takes the category from the code and drops removed actions
- Actions acting on the page check `state.inConversationPage` (`state.ts`) and are answered by `useMainPage()`

### Mouse Click-through

- `state.ignoreMouse` is the user's preference; `applyIgnoreMouse()` in `shortcuts.ts` is the only place that applies it to the window. Go through `setIgnoreMouse()` / `applyIgnoreMouse()`, never `setIgnoreMouseEvents()` directly
- It is suspended while the settings page is up (`inSettingsPage`): the switch that turns it off lives there, so applying it would trap the user. The preference is kept and applied on the way out
- Independent of the overlay toolbar, and the shortcut works on every page as an escape hatch

### UI Component Patterns

- shadcn/ui components in `src/renderer/src/components/ui/` — do NOT edit these directly, use the shadcn CLI to add/update
- `cn()` utility (clsx + tailwind-merge) for conditional class merging
- `getCloneableFields()` strips functions from store state before sending over IPC
- Platform-aware shortcut display via `ShortcutRenderer` (⌘, ⌥, ⇧ on Mac; Ctrl, Alt, Shift on Windows)

## Development

### Commands

```bash
npm install          # Install dependencies
npm run dev          # Start in dev mode (electron-vite dev)
npm run build        # Typecheck + build (electron-vite build)
npm run build:mac    # Build macOS distributable
npm run build:win    # Build Windows distributable
npm run typecheck    # Run TypeScript type checking (node + web)
npm run lint         # Run ESLint
npm run format       # Run Prettier
```

### Configuration

The `.env` file at project root configures the AI provider:

```env
API_BASE_URL="https://openrouter.ai/api/v1"  # OpenAI-compatible API endpoint
API_KEY="sk-..."                               # API key
MODEL="gpt-5-mini"                             # Optional: override default model
```

These are read by dotenv in the main process and merged with renderer-side settings (renderer settings take priority when set).

### Path Aliases

- `@renderer/*` and `@/*` both resolve to `src/renderer/src/*`
- Configured in `tsconfig.web.json` and `electron.vite.config.ts`

### Code Style

- Prettier: single quotes, no semicolons, 100 char print width, no trailing commas
- ESLint: TypeScript + React + React Hooks + React Refresh rules
- UI text and user-facing strings are in **Chinese** (中文)
- Code comments and variable names are in **English**

## Important Notes for AI Agents

1. **Three TypeScript configs**: `tsconfig.node.json` (main + preload), `tsconfig.web.json` (renderer). The root `tsconfig.json` is a project references file only.

2. **System prompts live in the renderer**: All preset scene prompts are defined in `src/renderer/src/lib/store/settings.ts` (`PRESET_SCENE_PROMPTS`). The main process only consumes the synced `conversationPrompt` and has no built-in prompt of its own.

3. **`global.mainWindow`**: The main window reference is stored as a global variable, declared in `src/main/index.d.ts`.

4. **Settings flow**: `.env` → main process `settings` object → renderer reads on mount via IPC → renderer persists to localStorage via Zustand. Renderer-side changes are sent back to main via `updateAppSettings`.

5. **No shared types directory**: Main process types (`AppSettings`, `AppState`) are imported directly by the preload script from `../main/settings` and `../main/state`. This works because preload shares the Node.js tsconfig. Runtime code both sides need goes in `src/shared/` (included by both tsconfigs, imported by relative path) and must stay free of Electron, DOM and Node APIs.

6. **Hint orchestration is in `conversation.ts`**: utterances, hint cards, 复盘库 lookup and streaming. `shortcuts.ts` only handles the window and dispatches shortcut actions.

7. **One page**: the conversation page is the index route (`HOME_PATH`); the settings / help back buttons return there.

8. **Window movement**: The window can be moved via keyboard shortcuts in 200px steps (up/down/left/right), and resized by dragging its edges (see Window Resizing).

9. **macOS auto-update is disabled**: `publish: null` in electron-builder.yml for mac target. Auto-update only works on Windows.

10. **macOS and Windows only**: Linux is not a supported or built target.

11. **Prompt files are Prettier-ignored**: `src/renderer/src/lib/store/prompts/` is listed in `.prettierignore` — Prettier rewrites the literal ``` fences inside those prompts, which changes what the model is told.
