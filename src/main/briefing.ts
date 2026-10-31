import { app, dialog, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import type { ModelMessage } from 'ai'
import { getModel, getResearchStream } from './ai'
import { getKnowledgePrompt, setResumeAttached } from './knowledge'
import { extractFileText } from './knowledge-parse'
import { KNOWLEDGE_EXTENSIONS } from '../shared/knowledge'
import { getHintProfile, settings } from './settings'
import { consumeStream, extractErrorMessage } from './stream'
import { hostOf, onHosts, OPENROUTER_HOSTS } from './thinking'
import type { ApiProfile } from '../shared/api-profile'
import {
  BRIEFING_COMPANY_CHARS,
  BRIEFING_INTRO_CHARS,
  BRIEFING_JD_CHARS,
  DEFAULT_INTRO_PROMPT,
  type Briefing,
  type BriefingRoute
} from '../shared/briefing'

/**
 * 面试准备: before an interview the user enters the company and the JD, and a
 * model with time to spare (web search on where the platform has it, thinking
 * left on) writes a one-page 行业卡片 — the industry's applications, the main
 * product forms and where each fits, what the job's tasks are in practice, what
 * makes the field hard — from what it finds and the user's 资料库.
 *
 * The company, the JD and the finished card then go into every hint's system
 * prompt (`getBriefingPrompt()`), after the 资料库 and before the scene prompt:
 * it changes once per interview, so the cached prefix holds across requests.
 * Kept on disk (`userData/briefing.json`) so a restart before the interview
 * keeps it, and ended with the interview by 「清空对话」 (`endInterview()`),
 * which the user can undo.
 */

const DASHSCOPE_HOSTS = ['dashscope.aliyuncs.com']
/** Where a card is researched when the hint profile's platform cannot search: the 语音 settings' 百炼 key */
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DASHSCOPE_MODEL = 'qwen-plus'

/** What goes along with every hint, at most: the JD and the card */
const PROMPT_JD_CHARS = 3000
const PROMPT_CARD_CHARS = 6000
/** The resume attached for this interview: kept, and sent with every hint */
const RESUME_CHARS = 20000
const PROMPT_RESUME_CHARS = 6000

const RESEARCH_PROMPT = `你是面试准备助手。用户马上要参加一场面试，下面给出目标公司和岗位 JD。请先检索（能联网就联网搜索）这家公司、这个岗位所在的行业和相关业务，再写一页「行业卡片」，让用户几分钟内搞清这家公司、这个岗位和这个行业是怎么回事，面试中接得住行业和业务相关的问题。

这是一份客观的行业与岗位资料，不涉及应聘者本人：不要猜测、评价或联系应聘者的经历和背景。

要求：
- 岗位方向严格以岗位名称和 JD 原文为准（例如「信息通信业务」就写通信网络、信息系统等方向），不要往别的方向引申；JD 很短时，按这家公司里这类岗位通常做什么来写，并说明是推断。
- 先判断岗位所在的具体行业和业务领域（例如「电网信息通信」，而不是笼统的「电力」），全文围绕它写。
- 用 Markdown，按下面的小节写，每节用要点列表，写具体的系统、设备、场景、指标和做法，要能直接在面试里说出口；不要空话套话。
- 只写检索到或确有把握的事实。具体数据、产品型号、标准编号、客户、市场份额等，没有可靠来源的一律标注「待核实」，宁可不写也不要编造；检索到的关键事实在句末注明来源网站。
- 「JD 核心要求」只从 JD 原文提炼，不要添加 JD 没写的要求。
- 总长度 1500–2500 字。

## 公司与岗位
公司做什么、主营业务和客户、在行业里的位置；这个岗位在其中负责什么；JD 的核心要求（3–5 条，引自 JD 原文）。

## 行业应用
这个行业里（与岗位相关的技术或产品）有哪些应用场景，各自是什么、谁在用、发展到什么程度。

## 主流形态与适用场景
主流的产品形态或技术路线，各自的适用场景和优缺点，用表格对比。

## 具体任务
在实际场景里要完成哪些具体任务，每项做到什么程度、靠什么技术实现。

## 场景难点
现场环境和业务带来的难点（环境、地形、干扰、安全、定位等方面，按行业取舍），以及常见的解决思路。

## 可能被问到
按 JD 和行业，列 6–10 个可能被问的业务、行业或专业问题，每个附一句答题要点（讲行业和技术本身，不涉及应聘者经历）。`

const INTRO_PROMPT = `你是面试准备助手。根据用户的简历、目标岗位 JD 和行业卡片，写一段面试开场的自我介绍。要求：

{requirements}

只输出自我介绍正文。`

const empty = (): Briefing => ({
  company: '',
  jd: '',
  card: '',
  reasoning: '',
  status: 'idle',
  resume: '',
  resumeName: '',
  intro: '',
  introStatus: 'idle'
})

let briefing: Briefing | null = null
let controller: AbortController | null = null
/** Bumped by every new request and by a clear, so a stream that lost its card never writes to it again */
let generation = 0

const filePath = () => join(app.getPath('userData'), 'briefing.json')

function load(): Briefing {
  if (briefing) return briefing
  briefing = empty()
  try {
    if (existsSync(filePath())) {
      const saved = JSON.parse(readFileSync(filePath(), 'utf-8')) as Partial<Briefing>
      briefing = {
        ...briefing,
        ...saved,
        reasoning: '',
        // A card the app quit in the middle of keeps what it had
        status: saved.status === 'streaming' ? 'stopped' : (saved.status ?? 'idle'),
        introStatus: saved.introStatus === 'streaming' ? 'stopped' : (saved.introStatus ?? 'idle')
      }
    }
  } catch (error) {
    console.error('Failed to load the briefing:', error)
  }
  return briefing
}

/** Writes run one after another, so a slow one never lands after a newer one */
let writing: Promise<void> = Promise.resolve()

function save() {
  // The reasoning can run long and is only worth watching while it forms
  const content = JSON.stringify({ ...load(), reasoning: undefined }, null, 2)
  writing = writing
    .then(async () => {
      mkdirSync(app.getPath('userData'), { recursive: true })
      const temp = `${filePath()}.tmp`
      await writeFile(temp, content, 'utf-8')
      await rename(temp, filePath())
    })
    .catch((error) => console.error('Failed to save the briefing:', error))
}

function send(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

const changeListeners: (() => void)[] = []

/** Run `listener` whenever the briefing changes, a card's chunks aside */
export function onBriefingChanged(listener: () => void): void {
  changeListeners.push(listener)
}

function publish() {
  send('briefing-update', { ...load() })
  for (const listener of changeListeners) listener()
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** The request-body fields that turn on this platform's web search; null when it has none we know */
function searchFields(baseURL: string): Record<string, unknown> | null {
  const host = hostOf(baseURL)
  // Works for any model OpenRouter routes to, billed per request by OpenRouter
  if (onHosts(host, OPENROUTER_HOSTS)) return { plugins: [{ id: 'web', max_results: 8 }] }
  // Qwen models on 百炼; forced, so the model cannot decide it knows enough
  if (onHosts(host, DASHSCOPE_HOSTS)) {
    return { enable_search: true, search_options: { forced_search: true } }
  }
  return null
}

interface Route extends BriefingRoute {
  profile: ApiProfile
  fields: Record<string, unknown> | null
}

/**
 * Who writes the card: the hint profile, searching where its platform can.
 * Asked to search on a platform that cannot, the 百炼 key the speech
 * recognition already uses does it with a Qwen model instead; without that key
 * the hint profile writes from what the model knows.
 */
function resolveRoute(webSearch: boolean): Route {
  const profile = getHintProfile()
  const fields = webSearch ? searchFields(profile.apiBaseURL) : null
  if (webSearch && !fields && settings.dashscopeApiKey) {
    return {
      profile: {
        id: '',
        name: '百炼',
        apiBaseURL: DASHSCOPE_BASE_URL,
        apiKey: settings.dashscopeApiKey,
        apiHeaders: '',
        model: DASHSCOPE_MODEL,
        disableThinking: false,
        enableThinking: false
      },
      model: DASHSCOPE_MODEL,
      search: true,
      dashscope: true,
      fields: searchFields(DASHSCOPE_BASE_URL)
    }
  }
  return { profile, model: getModel(profile), search: Boolean(fields), dashscope: false, fields }
}

/**
 * A fetch that adds the search fields to the request. A platform or model that
 * refuses them gets the request again without: the card is still written, from
 * what the model knows, and says so.
 */
function createSearchFetch(fields: Record<string, unknown>, onRefused: () => void): typeof fetch {
  return async (input, init) => {
    let body: unknown
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    } catch {
      body = undefined
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fetch(input, init)
    const response = await fetch(input, {
      ...init,
      body: JSON.stringify({ ...body, ...fields })
    })
    if (response.status !== 400 && response.status !== 422) return response
    onRefused()
    return fetch(input, init)
  }
}

function resumeBlock(resume: string, max: number): string {
  return resume.trim() ? `【简历】\n${clip(resume.trim(), max)}` : ''
}

/**
 * The card's request: the company and the JD, nothing about the user. Given
 * the resume, a model bends the role towards it (a 信息通信 job written up as
 * robotics) and makes up links to it; tying the two together is the
 * self-introduction's job, and the hints', which have both
 */
function researchMessages(company: string, jd: string): ModelMessage[] {
  const today = new Date().toISOString().slice(0, 10)
  const parts = [
    `【目标公司】\n${company || '（未填写，请从 JD 判断）'}`,
    `【岗位 JD】\n${jd || '（未填写，请按公司的主营业务判断岗位方向）'}`,
    `今天是 ${today}。请写这场面试的行业卡片。`
  ]
  return [{ role: 'user', content: parts.filter(Boolean).join('\n\n') }]
}

function introMessages({ company, jd, resume, card }: Briefing): ModelMessage[] {
  const parts = [
    company && `【目标公司】\n${company}`,
    jd && `【岗位 JD】\n${jd}`,
    resumeBlock(resume, RESUME_CHARS) || '【简历】\n（未附简历，按资料库里的内容写）',
    card.trim() && `【行业卡片】\n${card.trim()}`,
    '请写这场面试的自我介绍。'
  ]
  return [{ role: 'user', content: parts.filter(Boolean).join('\n\n') }]
}

export function getBriefingRoute(webSearch: boolean): BriefingRoute {
  const { model, search, dashscope } = resolveRoute(webSearch)
  return { model, search, dashscope }
}

const NO_KEY = '出提示使用的 AI 配置未填写 API Key，请到「设置 → AI 模型」填写'

/**
 * Research the card for `company` and `jd`, replacing whatever card there was,
 * then write the self-introduction with it
 */
async function generate(
  companyInput: string,
  jdInput: string,
  webSearch: boolean,
  requirements: string
) {
  controller?.abort()
  controller = null
  cleared = null
  const gen = ++generation
  const company = String(companyInput ?? '')
    .trim()
    .slice(0, BRIEFING_COMPANY_CHARS)
  const jd = String(jdInput ?? '')
    .trim()
    .slice(0, BRIEFING_JD_CHARS)
  const route = resolveRoute(webSearch)
  const { resume, resumeName } = load()
  briefing = {
    ...empty(),
    resume,
    resumeName,
    company,
    jd,
    status: 'streaming',
    model: route.model,
    searched: route.search
  }

  const refuse = (error: string) => {
    Object.assign(briefing!, { status: 'error', error })
    publish()
    save()
  }
  if (!company && !jd) return refuse('请至少填写公司名称或岗位 JD')
  if (!route.profile.apiKey) return refuse(NO_KEY)
  publish()

  const current = new AbortController()
  controller = current
  const startedAt = Date.now()
  const card = briefing
  // No 资料库 either: see researchMessages
  const system = RESEARCH_PROMPT
  const customFetch = route.fields
    ? createSearchFetch(route.fields, () => {
        card.searched = false
      })
    : undefined
  const outcome = await consumeStream(
    (signal) =>
      getResearchStream(route.profile, system, researchMessages(company, jd), signal, customFetch),
    current,
    (chunk) => {
      if (chunk.kind === 'reasoning') card.reasoning += chunk.delta
      else card.card += chunk.delta
      send('briefing-chunk', chunk.kind, chunk.delta)
    }
  )
  // A newer request or a clear took over
  if (gen !== generation) return
  controller = null
  card.durationMs = Date.now() - startedAt
  card.updatedAt = Date.now()
  if (outcome.status === 'failed') {
    console.error('Error researching the briefing:', outcome.error)
    card.status = 'error'
    card.error = extractErrorMessage(outcome.error)
  } else {
    card.status = outcome.status === 'aborted' ? 'stopped' : 'done'
  }
  publish()
  save()
  if (card.status === 'done') await writeIntro(gen, requirements)
}

/**
 * The self-introduction, from the resume, the JD and the card, as
 * `requirements` asks (the page's 「自我介绍要求」). Written with the hint
 * profile: no search is needed for it
 */
async function writeIntro(gen: number, requirements: string) {
  const b = load()
  const profile = getHintProfile()
  b.intro = ''
  b.introError = undefined
  b.introEdited = undefined
  if (!profile.apiKey) {
    Object.assign(b, { introStatus: 'error', introError: NO_KEY })
    publish()
    save()
    return
  }
  b.introStatus = 'streaming'
  publish()

  const current = new AbortController()
  controller = current
  const system = [
    getKnowledgePrompt(),
    INTRO_PROMPT.replace('{requirements}', requirements.trim() || DEFAULT_INTRO_PROMPT)
  ]
    .filter(Boolean)
    .join('\n\n')
  const outcome = await consumeStream(
    (signal) => getResearchStream(profile, system, introMessages(b), signal),
    current,
    (chunk) => {
      // Its reasoning is not shown: the card's is what a long wait is spent on
      if (chunk.kind !== 'text') return
      b.intro += chunk.delta
      send('briefing-chunk', 'intro', chunk.delta)
    }
  )
  if (gen !== generation) return
  controller = null
  if (outcome.status === 'failed') {
    console.error('Error writing the self-introduction:', outcome.error)
    b.introStatus = 'error'
    b.introError = extractErrorMessage(outcome.error)
  } else {
    b.introStatus = outcome.status === 'aborted' ? 'stopped' : 'done'
  }
  publish()
  save()
}

/** 「重新生成自我介绍」: with the card there is; not while anything is being written */
function regenerateIntro(requirements: string) {
  const b = load()
  if (b.status === 'streaming' || b.introStatus === 'streaming') return
  cleared = null
  void writeIntro(++generation, requirements)
}

/**
 * The self-introduction as the user edited or wrote it: used from then on like
 * a written one (shown when asked for, in every hint's system prompt). Blank
 * drops it. Not while anything is being written: that would overwrite it
 */
function setIntro(text: string) {
  const b = load()
  if (b.status === 'streaming' || b.introStatus === 'streaming') return
  const intro = String(text ?? '')
    .trim()
    .slice(0, BRIEFING_INTRO_CHARS)
  cleared = null
  Object.assign(b, {
    intro,
    introStatus: intro ? 'done' : 'idle',
    introError: undefined,
    introEdited: intro ? true : undefined
  })
  publish()
  save()
}

/** Attach a resume: picked in a dialog, its text kept. Returns why it failed, if it did */
async function pickResume(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: '选择简历',
    properties: ['openFile'],
    filters: [{ name: 'PDF、Word、Markdown、TXT', extensions: KNOWLEDGE_EXTENSIONS }]
  })
  const path = result.filePaths[0]
  if (result.canceled || !path) return null
  try {
    const text = await extractFileText(path)
    if (!text.trim()) return '没有从文件里读出文字（扫描版 PDF 需要先转成文字）'
    Object.assign(load(), { resume: text.slice(0, RESUME_CHARS), resumeName: basename(path) })
    publish()
    save()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * The company and JD as typed, kept before any card is asked for, so the page
 * shows them again after a restart. Not while a card is being written: it
 * has its own copy of what it was asked with
 */
function setInput(companyInput: string, jdInput: string) {
  const b = load()
  if (b.status === 'streaming' || b.introStatus === 'streaming') return
  b.company = String(companyInput ?? '')
    .trim()
    .slice(0, BRIEFING_COMPANY_CHARS)
  b.jd = String(jdInput ?? '')
    .trim()
    .slice(0, BRIEFING_JD_CHARS)
  save()
}

function removeResume() {
  Object.assign(load(), { resume: '', resumeName: '' })
  publish()
  save()
}

function stop() {
  controller?.abort()
}

/** Drop this interview's preparation, the resume attached for it included */
function clear() {
  generation++
  controller?.abort()
  controller = null
  briefing = empty()
  cleared = null
  publish()
  save()
}

/**
 * Whether 「清空对话」 would take a preparation with it: something is there,
 * and nothing of it is still being written (that is for the next interview)
 */
export function hasPreparation(): boolean {
  const b = load()
  if (b.status === 'streaming' || b.introStatus === 'streaming') return false
  return Boolean(b.company || b.jd || b.card || b.intro || b.resume)
}

/** What 「清空对话」 took away, until the user undoes it or prepares anew */
let cleared: Briefing | null = null

/**
 * 「清空对话」: the interview is over, and its card must not slip into the
 * next one. It can be undone (a microphone test cleared before the interview
 * would otherwise cost a whole search). A card still being written is left
 * alone: it is for the interview about to start.
 */
export function endInterview(): void {
  if (!hasPreparation()) return
  const current = load()
  clear()
  cleared = current
  send('briefing-cleared', current.company)
}

function restore() {
  if (!cleared) return
  // The page may have started another card since; the restored one replaces it
  generation++
  controller?.abort()
  controller = null
  briefing = cleared
  cleared = null
  publish()
  save()
}

/** A copy, for the conversation's record on disk */
export function getBriefing(): Briefing {
  return { ...load() }
}

/** The company, for the 复盘库 search: a self-introduction prepared for this company ranks higher */
export function getBriefingCompany(): string {
  return load().company
}

/** The finished self-introduction, shown as is when the other side asks for one; '' when there is none */
export function getPreparedIntro(): string {
  const { intro, introStatus } = load()
  return introStatus === 'done' ? intro.trim() : ''
}

/**
 * This interview's resume, target, 行业卡片 and self-introduction, for the
 * system prompt of every hint. A part still being written is left out; it is
 * not that part yet.
 */
export function getBriefingPrompt(): string {
  const { company, jd, card, status, resume } = load()
  const finished = status === 'streaming' ? '' : card.trim()
  const intro = getPreparedIntro()
  if (!company && !jd.trim() && !finished && !resume.trim() && !intro) return ''

  const parts = [
    '# 本场面试的准备',
    '以下是用户面试前为这场面试准备的简历、目标公司、岗位 JD、行业卡片和自我介绍（有哪些给哪些）。涉及用户经历时以简历为准；回答涉及行业、业务、公司或岗位的问题时参考行业卡片，让回答贴合这家公司和这个行业；对方让做自我介绍时，以「准备好的自我介绍」为准。与问题无关时忽略，不要提及这些材料本身。卡片中标注「待核实」的信息不要当作确定事实说出口。'
  ]
  if (resume.trim()) parts.push(`<简历>\n${clip(resume.trim(), PROMPT_RESUME_CHARS)}\n</简历>`)
  const name = company.replaceAll('"', "'")
  if (jd.trim()) {
    parts.push(
      `<目标岗位${name ? ` 公司="${name}"` : ''}>\n${clip(jd.trim(), PROMPT_JD_CHARS)}\n</目标岗位>`
    )
  } else if (company) {
    parts.push(`目标公司：${company}`)
  }
  if (finished) parts.push(`<行业卡片>\n${clip(finished, PROMPT_CARD_CHARS)}\n</行业卡片>`)
  if (intro) parts.push(`<准备好的自我介绍>\n${intro}\n</准备好的自我介绍>`)
  parts.push('---')
  return parts.join('\n\n')
}

// An attached resume stands in for the 资料库's for this interview: one resume, the one meant for it
setResumeAttached(() => Boolean(load().resume.trim()))

ipcMain.handle('briefing:get', () => ({ ...load() }))
ipcMain.handle('briefing:route', (_event, webSearch: boolean) =>
  getBriefingRoute(Boolean(webSearch))
)
ipcMain.handle(
  'briefing:generate',
  (_event, company: string, jd: string, webSearch: boolean, requirements: string) => {
    void generate(company, jd, Boolean(webSearch), String(requirements ?? ''))
  }
)
ipcMain.handle('briefing:intro', (_event, requirements: string) =>
  regenerateIntro(String(requirements ?? ''))
)
ipcMain.handle('briefing:set-intro', (_event, text: string) => setIntro(text))
ipcMain.handle('briefing:pick-resume', () => pickResume())
ipcMain.handle('briefing:remove-resume', () => removeResume())
ipcMain.handle('briefing:set-input', (_event, company: string, jd: string) => setInput(company, jd))
ipcMain.handle('briefing:stop', () => stop())
ipcMain.handle('briefing:clear', () => clear())
ipcMain.handle('briefing:restore', () => restore())
