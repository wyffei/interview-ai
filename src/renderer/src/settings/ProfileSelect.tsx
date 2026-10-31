import { TriangleAlert } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useSettingsStore, type ApiProfile, type AppMode } from '@/lib/store/settings'
import { thinkingTag } from '@/lib/api-profiles'
import { Field } from './components'

const NOTES: Record<AppMode, string> = {
  conversation: '只发文字；换成关闭思考的快模型，出提示更快',
  screenshot: '要发图片，模型必须能识图（如 Qwen3-VL、GPT-5、Gemini），纯文本模型会报错'
}

function describe(profile: ApiProfile): string {
  const tags = [profile.model || '未设置模型', thinkingTag(profile)].filter(Boolean)
  return `${profile.name.trim() || '未命名配置'}（${tags.join(' · ')}）`
}

/** Which saved profile a mode sends its requests with */
export function ProfileSelect({
  mode = 'conversation',
  onEdit
}: {
  mode?: AppMode
  /** Open the profile in the AI 模型 group */
  onEdit: (profileId: string) => void
}) {
  const { apiProfiles, setConversationProfile, setScreenshotProfile } = useSettingsStore()
  const selectedId = useSettingsStore((s) =>
    mode === 'screenshot' ? s.screenshotProfileId : s.conversationProfileId
  )
  const selected = apiProfiles.find((p) => p.id === selectedId)
  const select = mode === 'screenshot' ? setScreenshotProfile : setConversationProfile

  return (
    <div>
      <Field
        label="使用的 AI 配置"
        note={
          <>
            {NOTES[mode]}
            {selected && (
              <button
                className="ml-1 text-blue-700 hover:underline cursor-pointer"
                onClick={() => onEdit(selected.id)}
              >
                编辑
              </button>
            )}
          </>
        }
      >
        <Select value={selectedId} onValueChange={(id) => select(id)}>
          <SelectTrigger className="w-60 shrink-0 bg-white">
            <SelectValue placeholder="选择配置" />
          </SelectTrigger>
          <SelectContent>
            {apiProfiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {describe(profile)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {selected && !selected.apiKey.trim() && (
        <p className="mt-1.5 flex items-start justify-end gap-1 text-right text-xs text-amber-800">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>这个配置还没有填写 API Key</span>
        </p>
      )}
    </div>
  )
}
