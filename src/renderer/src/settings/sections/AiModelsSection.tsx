import { Bot } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useSettingsStore } from '@/lib/store/settings'
import { changeApiBaseURL } from '@/lib/model-switch'
import { thinkingModeOf } from '../../../../shared/api-profile'
import { ApiProfiles, ApiSaveStatus } from '../ApiProfiles'
import { ApiHeadersField } from '../ApiHeadersField'
import { ModelField } from '../ModelField'
import { SelectBaseURL } from '../SelectBaseURL'
import { Advanced, Field, SecretInput, SettingsCard } from '../components'

const THINKING_NOTES: Record<ReturnType<typeof thinkingModeOf>, string> = {
  default: '不额外要求，按平台对这个模型的默认做法；有的模型默认会想，有的不会',
  on: '让能切换的模型（如百炼 Qwen3 系列、DeepSeek、GLM）先思考再作答，难题、截图选择题更准，但要多等几秒到几十秒；模型不支持时自动忽略',
  off: '跳过答题前的思考过程，出字更快，难题可能不如开着准；模型不支持时自动忽略'
}

/** Every saved AI profile; hints use the one picked in 出提示 or via 「用于」 */
export function AiModelsSection() {
  const { apiBaseURL, apiKey, apiHeaders, disableThinking, enableThinking, updateCredential } =
    useSettingsStore()
  const thinking = thinkingModeOf({ disableThinking, enableThinking })

  return (
    <SettingsCard Icon={Bot} title="AI 模型" extra={<ApiSaveStatus />}>
      <p className="-mt-2 mb-4 text-xs font-light">
        在这里保存常用的 AI 配置；出提示和截图模式各用其中一个，分别在「出提示」「截图模式」里选
      </p>
      <ApiProfiles>
        <Field label="API Base URL" note="可选常用平台，也可输入其他 OpenAI 兼容地址">
          <SelectBaseURL value={apiBaseURL} onChange={changeApiBaseURL} />
        </Field>

        <Field label="API Key">
          <SecretInput
            value={apiKey}
            onChange={(value) => updateCredential({ apiKey: value })}
            placeholder="输入 API Key"
          />
        </Field>

        <ModelField />

        <Field label="思考" note={THINKING_NOTES[thinking]}>
          <Select
            value={thinking}
            onValueChange={(value) =>
              updateCredential({ disableThinking: value === 'off', enableThinking: value === 'on' })
            }
          >
            <SelectTrigger className="w-60 shrink-0 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">默认（按平台和模型）</SelectItem>
              <SelectItem value="on">开启思考</SelectItem>
              <SelectItem value="off">关闭思考</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Advanced defaultOpen={!!apiHeaders.trim()}>
          <ApiHeadersField />
        </Advanced>
      </ApiProfiles>
    </SettingsCard>
  )
}
