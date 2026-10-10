import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { isModifierKey, getShortcutAccelerator } from '@/lib/utils/keyboard'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { useSettingsStore } from '@/lib/store/settings'

const ShortcutsContext = createContext<{
  recordingAction: string | null
  setRecordingAction: (action: string | null) => void
}>({
  recordingAction: null,
  setRecordingAction: () => {}
})

export function CustomShortcuts() {
  const { shortcuts, updateShortcut } = useShortcutsStore()
  const { dashscopeApiKey } = useSettingsStore()
  const [recordingAction, setRecordingAction] = useState<string | null>(null)

  const onShortcutChange = useCallback(
    (action: string, key: string) => {
      const newShortcut = { ...shortcuts[action], key }
      updateShortcut(action, newShortcut)
      window.api.updateShortcuts([newShortcut])
    },
    [shortcuts, updateShortcut]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!recordingAction) return

      e.preventDefault()

      if (isModifierKey(e.code)) return
      const accelerator = getShortcutAccelerator(e)
      // User press escape to cancel recording.
      if (e.code === 'Escape' && !accelerator) {
        setRecordingAction(null)
      }
      if (!accelerator) return
      onShortcutChange(recordingAction, accelerator)
      setRecordingAction(null)
    },
    [recordingAction, onShortcutChange]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return (
    <ShortcutsContext.Provider value={{ recordingAction, setRecordingAction }}>
      <div className="space-y-4">
        {/* Window Management */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500">窗口管理</h3>
          <Shortcut label="隐藏/显示窗口" shortcut="hideOrShowMainWindow" />
          <Shortcut
            label="鼠标穿透"
            description="启用后窗口对鼠标穿透，可以点击窗口背后的内容"
            shortcut="ignoreOrEnableMouse"
          />
          <Shortcut
            label="提高不透明度"
            description="每次调整 5%，窗口更清晰"
            shortcut="increaseOpacity"
          />
          <Shortcut
            label="提高透明度"
            description="每次调整 5%，窗口更透明"
            shortcut="decreaseOpacity"
          />
        </div>

        {/* Hints */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500">出提示</h3>
          <Shortcut
            label="出提示"
            description="立即出提示，不等对方说完；没有新内容时换个说法重出"
            shortcut="generateHint"
          />
          <Shortcut
            label="切换自动/手动"
            description="自动：对方说完一句就出提示；手动：只在按「出提示」时出"
            shortcut="toggleHintMode"
          />
        </div>

        {/* AI and listening */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500">AI 与监听</h3>
          <Shortcut
            label="停止生成"
            description="打断正在生成的提示"
            shortcut="stopSolutionStream"
          />
          <Shortcut
            label="上一个模型"
            description="切换到上一个已保存的 AI 配置"
            shortcut="previousApiProfile"
          />
          <Shortcut
            label="下一个模型"
            description="切换到下一个已保存的 AI 配置"
            shortcut="nextApiProfile"
          />
          <Shortcut
            label="切换提示词场景"
            description="在场景间依次切换；从下次出提示开始生效，不清空当前对话"
            shortcut="cycleScene"
          />
          <Shortcut
            label="开始/停止监听"
            description="开始或停止监听对方说话"
            shortcut="toggleTranscription"
            disabled={!dashscopeApiKey}
          />
          <Shortcut
            label="清空对话"
            description="清空整段对话和提示"
            shortcut="clearTranscription"
            disabled={!dashscopeApiKey}
          />
        </div>

        {/* Navigation */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500">页面导航</h3>
          <Shortcut label="向上翻页" shortcut="pageUp" />
          <Shortcut label="向下翻页" shortcut="pageDown" />
        </div>

        {/* Window Movement */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-500">窗口移动</h3>
          <Shortcut label="向上移动窗口" shortcut="moveMainWindowUp" />
          <Shortcut label="向下移动窗口" shortcut="moveMainWindowDown" />
          <Shortcut label="向左移动窗口" shortcut="moveMainWindowLeft" />
          <Shortcut label="向右移动窗口" shortcut="moveMainWindowRight" />
        </div>
      </div>
    </ShortcutsContext.Provider>
  )
}

function Shortcut({
  label,
  description,
  shortcut: shortcutAction,
  disabled
}: {
  label: string
  description?: string
  shortcut: string
  disabled?: boolean
}) {
  const { shortcuts } = useShortcutsStore()
  const { recordingAction, setRecordingAction } = useContext(ShortcutsContext)
  const shortcut = shortcuts[shortcutAction]
  const isRecording = recordingAction === shortcutAction

  return shortcut ? (
    <div
      className={`flex items-center justify-between${disabled ? ' opacity-40 pointer-events-none' : ''}`}
    >
      <div className="flex gap-2 items-center">
        <label className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs font-light">{description}</p>}
      </div>
      <span
        className="cursor-pointer"
        onClick={() => setRecordingAction(isRecording ? null : shortcutAction)}
      >
        {!isRecording ? (
          <ShortcutRenderer shortcut={shortcut.key} />
        ) : (
          <span className="font-mono text-sm align-middle rounded-md pl-2 pr-1 py-1 transition-colors bg-gray-200 animate-pulse">
            请按下自定义快捷键...
          </span>
        )}
      </span>
    </div>
  ) : null
}

export function ResetDefaultShortcuts() {
  const { shortcuts, resetShortcuts } = useShortcutsStore()
  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto"
      onClick={async () => {
        await window.api.updateShortcuts(
          Object.values(shortcuts)
            .filter(({ key, defaultKey }) => key !== defaultKey)
            .map((shortcut) => ({
              ...shortcut,
              key: shortcut.defaultKey
            }))
        )
        resetShortcuts()
        toast.success('重置默认快捷键成功')
      }}
    >
      重置默认快捷键
    </Button>
  )
}
