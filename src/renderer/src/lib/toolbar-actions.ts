import {
  ChevronDown,
  ChevronUp,
  CircleStop,
  Layers,
  Lightbulb,
  Mic,
  MousePointer2,
  Sun,
  SunDim,
  Zap,
  type LucideIcon
} from 'lucide-react'

/** Action names the main process accepts from a toolbar click */
export type ToolbarActionName = Parameters<Window['api']['triggerAction']>[0]

export type ToolbarAction = {
  /** Also the shortcut action name, so the same key binding can be shown in help */
  action: ToolbarActionName
  Icon: LucideIcon
  /** Shown beside the icon on the toolbar */
  text: string
  /** The longer description on the help page */
  label: string
}

/** Window controls, after the hint buttons */
const WINDOW_ACTIONS: ToolbarAction[] = [
  { action: 'ignoreOrEnableMouse', Icon: MousePointer2, text: '鼠标穿透', label: '切换鼠标穿透' },
  { action: 'pageUp', Icon: ChevronUp, text: '上翻', label: '向上翻页' },
  { action: 'pageDown', Icon: ChevronDown, text: '下翻', label: '向下翻页' },
  { action: 'increaseOpacity', Icon: Sun, text: '更清晰', label: '提高不透明度（更清晰）' },
  { action: 'decreaseOpacity', Icon: SunDim, text: '更透明', label: '提高透明度（更透明）' }
]

/**
 * Buttons of the overlay toolbar, in display order. Drives both the
 * toolbar itself and its description on the help page, so the two never drift
 * apart. `hideOrShowMainWindow` is intentionally absent: hiding the window also
 * hides the toolbar, leaving no way to click the window back. So is 清空对话:
 * a hover-triggered button must not be able to wipe the conversation.
 */
export const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    action: 'generateHint',
    Icon: Lightbulb,
    text: '出提示',
    label: '立即出提示（没有新内容时换个说法重出）'
  },
  { action: 'toggleHintMode', Icon: Zap, text: '自动/手动', label: '切换自动/手动出提示' },
  { action: 'stopSolutionStream', Icon: CircleStop, text: '停止', label: '停止生成提示' },
  { action: 'toggleTranscription', Icon: Mic, text: '开始监听', label: '开始/停止监听对方说话' },
  ...WINDOW_ACTIONS,
  { action: 'cycleScene', Icon: Layers, text: '切换场景', label: '切换到下一个提示词场景' }
]
