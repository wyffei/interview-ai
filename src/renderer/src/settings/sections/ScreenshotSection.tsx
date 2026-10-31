import { useState } from 'react'
import { Camera, Crop, FileText, SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/lib/store/settings'
import { ProfileSelect } from '../ProfileSelect'
import { SceneEditor } from '../SceneEditor'
import { Field, SaveDirField, SettingsCard } from '../components'

/**
 * 截图模式: its own AI profile and prompt scenes, and where screenshots come
 * from. Nothing of the interview goes with a screenshot (资料库, 面试准备,
 * what was heard), so none of that is set up here.
 */
export function ScreenshotSection({ onEditProfile }: { onEditProfile: (id: string) => void }) {
  return (
    <>
      <SettingsCard Icon={SquareTerminal} title="AI 与提示词">
        <div className="space-y-4">
          <ProfileSelect mode="screenshot" onEdit={onEditProfile} />
          <SceneEditor mode="screenshot" />
        </div>
      </SettingsCard>

      <SettingsCard Icon={Camera} title="截图">
        <CaptureRegionField />
      </SettingsCard>

      <SettingsCard Icon={FileText} title="答题记录保存到本地">
        <SaveField />
      </SettingsCard>
    </>
  )
}

/** The record of each question, in the same folder as the conversation records */
function SaveField() {
  const screenshotAutoSave = useSettingsStore((state) => state.screenshotAutoSave)
  const conversationSaveDir = useSettingsStore((state) => state.conversationSaveDir)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  return (
    <div className="space-y-4">
      <Field
        label="保存答题记录"
        note="AI 答完后顺带从截图里识别出题目，连同答案和简要理由写进 Markdown 文件（这段不在页面上显示），每次打开应用一个文件；页面上的历史题目也显示这份答案。每题多花几秒、多几百字的费用"
      >
        <Switch
          className="scale-y-90"
          checked={screenshotAutoSave}
          onCheckedChange={(checked) => updateSetting('screenshotAutoSave', checked)}
        />
      </Field>
      {screenshotAutoSave && (
        <SaveDirField
          dir={conversationSaveDir}
          placeholder="默认: 文档/InterviewCoder（和对话记录同一个目录）"
          pick={window.api.selectConversationDir}
          onChange={(dir) => updateSetting('conversationSaveDir', dir)}
        />
      )}
    </div>
  )
}

/**
 * The area every screenshot is cropped to, picked the same way as from the
 * toolbar. Without one the screen under the mouse is captured whole.
 */
function CaptureRegionField() {
  const captureRegion = useSettingsStore((state) => state.captureRegion)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const [picking, setPicking] = useState(false)

  // The result reaches the store through App's `onCaptureRegionPicked`, the
  // same way as a pick started from the toolbar
  const pickRegion = async () => {
    setPicking(true)
    try {
      await window.api.pickCaptureRegion()
    } finally {
      setPicking(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm font-medium">
        截图区域
        <span className="ml-2 text-xs font-light">
          {captureRegion
            ? '「截图」「追加截图」只截框选的这块区域；题目位置变了记得重新框选。所在屏幕没接上时截整个屏幕'
            : '默认截取鼠标所在的整个屏幕；框选后只截这块区域，AI 看得更准，也更快'}
        </span>
      </label>
      <div className="flex w-60 shrink-0 gap-2">
        <Button
          variant="outline"
          className="flex-1 bg-white"
          disabled={picking}
          onClick={() => void pickRegion()}
        >
          <Crop />
          {picking ? '框选中…' : captureRegion ? '重新框选' : '框选区域'}
        </Button>
        {captureRegion && (
          <Button
            variant="outline"
            className="flex-1 bg-white"
            onClick={() => updateSetting('captureRegion', null)}
          >
            恢复整屏
          </Button>
        )}
      </div>
    </div>
  )
}
