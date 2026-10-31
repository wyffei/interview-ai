import { streamText, type ModelMessage, type TextStreamPart, type ToolSet } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { settings, getHintProfile } from './settings'
import { DEFAULT_API_BASE_URL, type ApiProfile } from '../shared/api-profile'
import { buildRequestHeaders } from '../shared/request-headers'
import { createThinkingOffFetch } from './thinking'
import { getKnowledgePrompt } from './knowledge'
import { getBriefingPrompt } from './briefing'
import type { StreamChunk } from './stream'

// The system prompt is fully managed by the renderer (prompt scenes in the
// settings store) and synced here via updateAppSettings on app startup. The
// 资料库 material sent in full goes first, then this interview's 行业卡片:
// both stay the same from one request to the next, so the cached prefix holds
function getSystemPrompt() {
  return (
    [getKnowledgePrompt(), getBriefingPrompt(), settings.conversationPrompt]
      .filter(Boolean)
      .join('\n\n') || undefined
  )
}

/** Tell the user once that the active model ignores the profile's 「关闭思考」 */
function reportThinkingRefused(model: string) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('thinking-unsupported', model)
}

function createProvider(profile: ApiProfile, customFetch?: typeof fetch) {
  // The app only ever talks OpenAI-compatible chat-completions; this provider
  // also surfaces thinking models' reasoning (`reasoning_content` / `reasoning`
  // deltas) as reasoning stream parts, which @ai-sdk/openai drops. It has no
  // default base URL, so an empty one means OpenAI here as everywhere else
  return createOpenAICompatible({
    name: 'interview-coder-cn',
    baseURL: profile.apiBaseURL.trim() || DEFAULT_API_BASE_URL,
    apiKey: profile.apiKey,
    headers: buildRequestHeaders(profile.apiKey, profile.apiHeaders),
    // Only when asked for: a plain request is the one every platform accepts
    ...(customFetch
      ? { fetch: customFetch }
      : profile.disableThinking
        ? { fetch: createThinkingOffFetch(profile.apiBaseURL, reportThinkingRefused) }
        : {})
  })
}

export function getModel(profile: ApiProfile) {
  const fallbackModel = profile.apiBaseURL.includes('siliconflow')
    ? 'Qwen/Qwen3-VL-32B-Instruct'
    : 'gpt-5-mini'
  return profile.model || fallbackModel
}

/**
 * One chunk at a time, tagged reasoning or answer text, so callers can route
 * them to their own events. Other stream parts (tool calls, sources, …) are
 * not produced with the plain chat setup and are dropped here.
 */
async function* streamChunks(
  fullStream: AsyncIterable<TextStreamPart<ToolSet>>
): AsyncIterable<StreamChunk> {
  for await (const event of fullStream) {
    if (event.type === 'reasoning-delta') yield { kind: 'reasoning', delta: event.text }
    else if (event.type === 'text-delta') yield { kind: 'text', delta: event.text }
  }
}

/** A hint for what the other side just said, with the conversation profile */
export function getHintStream(messages: ModelMessage[], abortSignal?: AbortSignal) {
  const profile = getHintProfile()
  const openai = createProvider(profile)

  const { fullStream } = streamText({
    model: openai.chatModel(getModel(profile)),
    system: getSystemPrompt(),
    messages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return streamChunks(fullStream)
}

/**
 * A long, unhurried request (the 行业卡片, see briefing.ts): no time limit and
 * thinking left on whatever the profile says, since nobody is waiting on a
 * call. `customFetch` adds the platform's web-search fields to the body.
 */
export function getResearchStream(
  profile: ApiProfile,
  system: string,
  messages: ModelMessage[],
  abortSignal: AbortSignal,
  customFetch?: typeof fetch
) {
  const provider = createProvider({ ...profile, disableThinking: false }, customFetch)
  const { fullStream } = streamText({
    model: provider.chatModel(getModel(profile)),
    system,
    messages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return streamChunks(fullStream)
}
