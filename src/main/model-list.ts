import { ipcMain } from 'electron'
import { buildRequestHeaders } from '../shared/request-headers'
import { DEFAULT_API_BASE_URL } from '../shared/api-profile'

export interface PlatformModel {
  id: string
}

export type ModelListResult = { models: PlatformModel[] } | { error: string }

export interface ListModelsOptions {
  /** Query string for `/models` */
  query?: string
  /** The profile's custom request headers, as typed in settings */
  headers?: string
}

/**
 * Ask an OpenAI-compatible platform which models it serves. Runs in main
 * rather than the renderer to avoid CORS, and uses the same global `fetch` as
 * the AI SDK so the result reflects what a real request would hit.
 */
async function listModels(
  baseURL: string,
  apiKey: string,
  { query, headers }: ListModelsOptions = {}
): Promise<ModelListResult> {
  const base = (baseURL.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  const url = `${base}/models${query ? `?${query}` : ''}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: buildRequestHeaders(apiKey, headers),
      signal: AbortSignal.timeout(10_000)
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    return { error: timedOut ? '请求超时' : '无法连接到该地址' }
  }

  if (res.status === 401 || res.status === 403) return { error: 'API Key 无效或没有权限' }
  if (res.status === 404) return { error: '该地址没有模型列表接口' }
  if (!res.ok) return { error: `接口返回 HTTP ${res.status}` }

  let models: PlatformModel[]
  try {
    const body = await res.json()
    const data: unknown[] = Array.isArray(body?.data) ? body.data : []
    models = data.flatMap((m) => {
      const item = m as { id?: unknown }
      return typeof item?.id === 'string' ? [{ id: item.id }] : []
    })
  } catch {
    return { error: '接口返回的不是模型列表' }
  }
  if (models.length === 0) return { error: '接口没有返回任何模型' }
  return { models }
}

ipcMain.handle(
  'listModels',
  (_event, baseURL: string, apiKey: string, options?: ListModelsOptions) =>
    listModels(baseURL, apiKey, options)
)
