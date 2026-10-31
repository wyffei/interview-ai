import { PanelTop } from 'lucide-react'
import { TOOLBAR_ACTIONS } from '@/lib/toolbar-actions'
import type { AppMode } from '@/lib/store/settings'
import { HelpSection } from './components'

export function OverlayToolbarHelp() {
  return (
    <HelpSection
      Icon={PanelTop}
      title="悬浮工具条"
      description="应用的所有操作都在这里，没有快捷键"
    >
      <p className="text-gray-700">
        工具条悬浮在主窗口正上方，宽度和主窗口一致，跟随主窗口移动，透明度也与主窗口保持一致，
        并且和主窗口一样在共享屏幕时对方不可见。应用不注册任何快捷键，不会和面试软件的按键冲突，所有操作都用工具条上的按钮完成。
      </p>
      <p className="text-sm font-medium text-gray-700">对话模式（出提示）</p>
      <ToolbarActions mode="conversation" />
      <p className="text-sm font-medium text-gray-700">截图模式：点最左侧的「截图模式」切过去</p>
      <ToolbarActions mode="screenshot" />
      <ul className="space-y-1 text-sm text-gray-700 list-disc list-inside">
        <li>点击按钮不会抢走焦点，会议窗口不会失焦，光标也不会有明显的窗口切换动作。</li>
        <li>开启「鼠标穿透」后主窗口不再响应鼠标，但工具条仍然可以点击。</li>
        <li>
          在「设置 → 界面与隐私 →
          工具条悬停触发」中可以改为：鼠标在按钮上停留一段时间即触发，全程不产生点击。
          停留过程中按钮下方会有进度条，中途移开即取消；触发后需移开再移回才会再次触发。
        </li>
        <li>
          拖动工具条的左右边缘可以调整它的宽度（高度固定）。边缘不会出现缩放光标，但照样可以拖。
          按钮尺寸保持不变，宽度不够时会从右侧开始隐藏放不下的按钮。移动窗口请拖动主窗口的标题栏。
        </li>
      </ul>
    </HelpSection>
  )
}

function ToolbarActions({ mode }: { mode: AppMode }) {
  const actions = TOOLBAR_ACTIONS[mode]

  return (
    <div className="space-y-2">
      <div className="overlay-toolbar w-fit max-w-full overflow-x-auto">
        {actions.map(({ action, Icon, text }) => (
          <div key={action} className="flex h-7 shrink-0 items-center gap-1 px-2 text-xs">
            <Icon className="size-3.5" />
            {text}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {actions.map(({ action, Icon, label }) => (
          <div
            key={action}
            className="flex items-center gap-2 rounded border border-gray-400 px-2 py-1"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-sm">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
