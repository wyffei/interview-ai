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
  UserRound,
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
  {
    action: 'pageUp',
    Icon: ChevronUp,
    text: '上翻',
    label: '提示面板向上翻一页（窗口不抢焦点、开着鼠标穿透时，滚轮用不了）'
  },
  { action: 'pageDown', Icon: ChevronDown, text: '下翻', label: '提示面板向下翻一页' },
  {
    action: 'increaseOpacity',
    Icon: Sun,
    text: '更清晰',
    label: '更清晰一挡（共五挡，最高完全不透明）'
  },
  {
    action: 'decreaseOpacity',
    Icon: SunDim,
    text: '更透明',
    label: '更透明一挡（最低完全透明，工具栏仍保留淡淡可见）'
  }
]

/**
 * Buttons of the overlay toolbar, in display order. Drives both the
 * toolbar itself and its description on the help page, so the two never drift
 * apart. `hideOrShowMainWindow` is intentionally absent: hiding the window also
 * hides the toolbar, leaving no way to click the window back. So is 清空对话:
 * a hover-triggered button must not be able to wipe the conversation.
 * `toggleSpeaker` is shown only in 手机面试模式 (see `PHONE_MODE_ACTIONS`).
 */
export const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    action: 'toggleSpeaker',
    Icon: UserRound,
    text: '对方在说',
    label: '手机面试模式：切换「对方在说」/「我在说」（我说的话不出提示）'
  },
  { action: 'toggleHintMode', Icon: Zap, text: '自动/手动', label: '切换自动/手动出提示' },
  { action: 'toggleTranscription', Icon: Mic, text: '开始监听', label: '开始/停止监听对方说话' },
  {
    action: 'generateHint',
    Icon: Lightbulb,
    text: '出提示',
    label: '立即出提示（没有新内容时换个说法重出）'
  },
  {
    action: 'stopSolutionStream',
    Icon: CircleStop,
    text: '停止生成',
    label: '停止生成提示（监听不受影响）'
  },
  ...WINDOW_ACTIONS,
  {
    action: 'cycleScene',
    Icon: Layers,
    text: '切换场景',
    label: '切换到下一个提示词场景（场景多时，点主窗口标题栏上的场景名直接选）'
  }
]

/** Buttons that only mean something in 手机面试模式 */
export const PHONE_MODE_ACTIONS = new Set<ToolbarActionName>(['toggleSpeaker'])
