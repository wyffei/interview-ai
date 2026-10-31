import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  Brain,
  Check,
  FileText,
  Globe,
  LoaderCircle,
  Mic,
  Paperclip,
  Pencil,
  Sparkles,
  Square,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { useSettingsStore } from '@/lib/store/settings'
import { HOME_PATH } from '@/lib/use-main-page'
import { formatDuration, useBriefing } from '@/lib/briefing'
import { useKnowledgeDocs } from '@/lib/knowledge'
import { isResumeDoc } from '../../../shared/knowledge'
import {
  BRIEFING_COMPANY_CHARS,
  BRIEFING_INTRO_CHARS,
  BRIEFING_JD_CHARS,
  DEFAULT_INTRO_PROMPT,
  type Briefing,
  type BriefingRoute
} from '../../../shared/briefing'

/**
 * 面试准备: before an interview, the company and the JD go in and a 行业卡片
 * comes out (see main briefing.ts); every hint of the interview then has it.
 */
export default function BriefingPage() {
  const briefing = useBriefing()
  const webSearch = useSettingsStore((state) => state.briefingWebSearch)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const profileId = useSettingsStore((state) => state.conversationProfileId)
  const dashscopeApiKey = useSettingsStore((state) => state.dashscopeApiKey)
  const [company, setCompany] = useState('')
  const [jd, setJd] = useState('')
  const [route, setRoute] = useState<BriefingRoute | null>(null)
  // What main holds as far as this page knows: typed here, or put there by a clear / undo
  const known = useRef<{ company: string; jd: string } | null>(null)

  // What was entered last time once main has answered, and whatever a clear or an undo puts there
  const mainCompany = briefing?.company
  const mainJd = briefing?.jd
  useEffect(() => {
    if (mainCompany === undefined || mainJd === undefined) return
    if (known.current?.company === mainCompany && known.current.jd === mainJd) return
    known.current = { company: mainCompany, jd: mainJd }
    setCompany(mainCompany)
    setJd(mainJd)
  }, [mainCompany, mainJd])

  // Kept as typed, so it is all still here next time, card or no card, until 清空对话
  useEffect(() => {
    if (!known.current) return
    const next = { company: company.trim(), jd: jd.trim() }
    if (next.company === known.current.company && next.jd === known.current.jd) return
    const timer = setTimeout(() => {
      known.current = next
      void window.api.setBriefingInput(next.company, next.jd)
    }, 500)
    return () => clearTimeout(timer)
  }, [company, jd])

  useEffect(() => {
    void window.api.getBriefingRoute(webSearch).then(setRoute)
  }, [webSearch, profileId, dashscopeApiKey])

  // The inputs here would be unreachable with click-through on; main applies it again on the way out
  useEffect(() => {
    window.api.updateAppState({ inSettingsPage: true })
    return () => {
      window.api.updateAppState({ inSettingsPage: false })
    }
  }, [])

  const streaming = briefing?.status === 'streaming' || briefing?.introStatus === 'streaming'
  const canGenerate = !streaming && (company.trim() || jd.trim())
  const introRequirements = useSettingsStore((state) => state.briefingIntroPrompt)
  const [editingIntro, setEditingIntro] = useState(false)

  return (
    <>
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="w-12 mr-2 rounded-none">
            <Link to={HOME_PATH}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <h1>面试准备</h1>
      </div>

      <div id="app-content" className="flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-3 rounded-lg bg-gray-300/80 p-5">
          <p className="text-sm text-gray-700">
            面试开始前附上简历、填写目标公司和岗位 JD，AI
            会花些时间检索这个行业，写一页「行业卡片」：行业里的应用、主流形态和适用场景、岗位具体做什么、场景难点；再据此写一段自我介绍。之后每条提示都会参考它们和资料库，对方让你自我介绍时直接显示这段。
          </p>
          <ResumeField briefing={briefing} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            公司名称
            <Input
              value={company}
              maxLength={BRIEFING_COMPANY_CHARS}
              placeholder="如「国网智能科技」"
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            岗位 JD
            <Textarea
              className="min-h-40 font-normal"
              value={jd}
              maxLength={BRIEFING_JD_CHARS}
              placeholder="粘贴招聘页上的岗位名称、职责和要求"
              onChange={(event) => setJd(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={webSearch}
                onCheckedChange={(checked) => updateSetting('briefingWebSearch', checked)}
              />
              联网搜索
            </label>
            {route && <RouteNote route={route} webSearch={webSearch} />}
          </div>
          <IntroRequirements />
          <div className="flex flex-wrap gap-2">
            {streaming ? (
              <Button variant="secondary" onClick={() => void window.api.stopBriefing()}>
                <Square />
                停止
              </Button>
            ) : (
              <Button
                disabled={!canGenerate}
                onClick={() =>
                  void window.api.generateBriefing(company, jd, webSearch, introRequirements)
                }
              >
                <Sparkles />
                {briefing?.card ? '重新生成行业卡片和自我介绍' : '生成行业卡片和自我介绍'}
              </Button>
            )}
            {!streaming && briefing?.card && (
              <Button
                variant="secondary"
                onClick={() => void window.api.regenerateIntro(introRequirements)}
              >
                <Mic />
                只重写自我介绍
              </Button>
            )}
            {!streaming && briefing?.introStatus === 'idle' && !editingIntro && (
              <Button variant="secondary" onClick={() => setEditingIntro(true)}>
                <Pencil />
                手写自我介绍
              </Button>
            )}
            {briefing &&
              (briefing.card ||
                briefing.company ||
                briefing.jd ||
                briefing.intro ||
                briefing.resume) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    void window.api.clearBriefing()
                    setCompany('')
                    setJd('')
                    setEditingIntro(false)
                  }}
                >
                  <Trash2 />
                  清除
                </Button>
              )}
          </div>
        </div>

        {briefing && (briefing.introStatus !== 'idle' || editingIntro) && (
          <IntroView briefing={briefing} editing={editingIntro} setEditing={setEditingIntro} />
        )}
        {briefing && briefing.status !== 'idle' && <CardView briefing={briefing} />}
      </div>
    </>
  )
}

/**
 * The resume for this interview: its text goes with the card, the
 * self-introduction and every hint, in place of the 资料库's resume
 */
function ResumeField({ briefing }: { briefing: Briefing | null }) {
  const [error, setError] = useState('')
  const [docs] = useKnowledgeDocs()
  const pick = () => void window.api.pickResume().then((failure) => setError(failure ?? ''))
  const libraryResumes = (docs ?? []).filter((doc) => !doc.disabled && isResumeDoc(doc))

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">简历</span>
      {briefing?.resumeName ? (
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{briefing.resumeName}</span>
          <span className="shrink-0 text-xs text-gray-600">{briefing.resume.length} 字</span>
          <Button size="sm" variant="ghost" onClick={pick}>
            更换
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void window.api.removeResume()}>
            移除
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={pick}>
            <Paperclip />
            选择简历文件
          </Button>
          <span className="text-xs text-gray-600">
            PDF、Word、Markdown、TXT；只用于这一场面试，清空对话时一并清掉。不附则用资料库里的简历
          </span>
        </div>
      )}
      {briefing?.resumeName && docs && (
        <span className="text-xs text-gray-600">
          {libraryResumes.length > 0
            ? `这场面试用它代替资料库里的${libraryResumes.map((d) => `「${d.name}」`).join('')}`
            : '资料库里没有名称含「简历」的资料；若资料库里另有简历，请把它改名或暂时停用，以免两份都发'}
        </span>
      )}
      {error && <span className="text-xs text-red-500">导入失败：{error}</span>}
    </div>
  )
}

/** What the self-introduction must be like, as the prompt says it; blank means the default */
function IntroRequirements() {
  const value = useSettingsStore((state) => state.briefingIntroPrompt)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium select-none">
        自我介绍要求
        {value.trim() && <span className="ml-2 text-xs font-light">已修改</span>}
      </summary>
      <Textarea
        className="mt-2 min-h-32 font-normal"
        value={value || DEFAULT_INTRO_PROMPT}
        onChange={(event) => {
          const next = event.target.value
          // Kept blank while it is the default, so a better default still reaches it
          updateSetting('briefingIntroPrompt', next.trim() === DEFAULT_INTRO_PROMPT ? '' : next)
        }}
      />
      {value.trim() && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1"
          onClick={() => updateSetting('briefingIntroPrompt', '')}
        >
          恢复默认
        </Button>
      )}
    </details>
  )
}

/**
 * The self-introduction, written by the model or the user. Edited here, it is
 * what the hints use from then on, until the model is asked to rewrite it
 */
function IntroView({
  briefing,
  editing,
  setEditing
}: {
  briefing: Briefing
  editing: boolean
  setEditing: (editing: boolean) => void
}) {
  const streaming = briefing.status === 'streaming' || briefing.introStatus === 'streaming'
  const [draft, setDraft] = useState('')

  // A rewrite started meanwhile would be overwritten by the draft
  useEffect(() => {
    if (streaming) setEditing(false)
  }, [streaming, setEditing])

  const startEditing = () => {
    setDraft(briefing.intro)
    setEditing(true)
  }
  const save = () => {
    void window.api.setIntro(draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-gray-300/80 p-5">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-medium">自我介绍</span>
          <span>约 {draft.trim().length} 字 · 保存后对方让你自我介绍时直接显示，留空则不用</span>
        </div>
        <Textarea
          autoFocus
          className="min-h-60 font-normal"
          value={draft}
          maxLength={BRIEFING_INTRO_CHARS}
          placeholder="写下你准备好的自我介绍"
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={save}>
            <Check />
            保存
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            取消
          </Button>
        </div>
      </div>
    )
  }

  const introStreaming = briefing.introStatus === 'streaming'
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-gray-300/80 p-5">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {introStreaming && <LoaderCircle className="size-3.5 animate-spin" />}
        <span className="font-medium">自我介绍</span>
        <span className="min-w-0 flex-1">
          {introStreaming
            ? '正在撰写…'
            : briefing.introStatus === 'stopped'
              ? '已停止'
              : briefing.introStatus === 'done' &&
                [
                  `约 ${briefing.intro.length} 字`,
                  briefing.introEdited && '已手动修改，「只重写自我介绍」会覆盖',
                  '对方让你自我介绍时直接显示'
                ]
                  .filter(Boolean)
                  .join(' · ')}
        </span>
        {!streaming && (
          <Button size="sm" variant="ghost" className="h-6 shrink-0" onClick={startEditing}>
            <Pencil />
            编辑
          </Button>
        )}
      </div>
      {briefing.intro && <MarkdownRenderer>{briefing.intro}</MarkdownRenderer>}
      {briefing.introStatus === 'error' && (
        <p className="text-sm break-words text-red-500">生成失败：{briefing.introError}</p>
      )}
    </div>
  )
}

function RouteNote({ route, webSearch }: { route: BriefingRoute; webSearch: boolean }) {
  let text: string
  if (route.dashscope)
    text = `出提示的平台不支持联网，改用百炼 ${route.model} 联网搜索（语音设置里的 Key）`
  else if (route.search) text = `${route.model} 联网搜索`
  else if (webSearch) {
    text = `${route.model} 所在平台不支持联网，且未填写百炼 Key，只能凭模型自身知识写`
  } else text = `${route.model}，凭模型自身知识写`
  return <span className="text-xs text-gray-600">{text}</span>
}

function CardView({ briefing }: { briefing: Briefing }) {
  const streaming = briefing.status === 'streaming'
  const meta = [
    briefing.model,
    briefing.searched ? '已联网搜索' : '未联网',
    briefing.durationMs !== undefined && `用时 ${formatDuration(briefing.durationMs)}`,
    briefing.status === 'stopped' && '已停止',
    (briefing.status === 'done' || briefing.status === 'stopped') && briefing.card && '已用于出提示'
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-gray-300/80 p-5">
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {streaming ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          briefing.searched && <Globe className="size-3.5" />
        )}
        <span>
          {streaming ? `${briefing.model} 正在检索和撰写，可以先去做别的…` : meta.join(' · ')}
        </span>
      </div>
      {briefing.reasoning && (
        <details className="text-xs text-gray-600" open={streaming && !briefing.card}>
          <summary className="flex cursor-pointer items-center gap-1 select-none">
            <Brain className="size-3" />
            思考过程
          </summary>
          <div className="mt-1 max-h-48 overflow-y-auto break-words opacity-80">
            <MarkdownRenderer compact>{briefing.reasoning}</MarkdownRenderer>
          </div>
        </details>
      )}
      {briefing.card && <MarkdownRenderer>{briefing.card}</MarkdownRenderer>}
      {briefing.status === 'error' && (
        <p className="text-sm break-words text-red-500">生成失败：{briefing.error}</p>
      )}
    </div>
  )
}
