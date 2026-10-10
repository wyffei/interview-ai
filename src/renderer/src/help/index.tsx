import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  Lightbulb,
  MessageCircle,
  MessagesSquare,
  PictureInPicture2,
  EyeOff,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { platformAlt } from '@/lib/utils/env'
import { MODE_PATH } from '@/lib/use-mode-page'
import { HelpSection } from './components'
import { Shortcuts } from './Shortcuts'
import { OverlayToolbarHelp } from './OverlayToolbar'
import { FAQ } from './FAQ'

export default function HelpPage() {
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  return (
    <>
      {/* Header */}
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="w-12 mr-2 rounded-none">
            <Link to={MODE_PATH}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <h1>帮助中心</h1>
      </div>

      {/* Help Content */}
      <div id="app-content" className="flex flex-col gap-4 p-8">
        {/* Introduction */}
        <HelpSection Icon={Info} title="简介" description={appVersion && `当前版本 v${appVersion}`}>
          <p className="text-gray-700">
            欢迎使用对话提示助手！在语音面试中，它听取对方说的话，结合您的简历和复盘库，
            实时给出回答要点。您可以访问上游项目{' '}
            <a
              href="https://github.com/ooboqoo/interview-coder-cn/wiki"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              GitHub Wiki
            </a>{' '}
            获取更多帮助信息（如安装说明、AI 配置填法、报错排查等）。
          </p>
          <div className="bg-gray-700/10 rounded-lg p-4">
            <h3 className="font-semibold mb-2">主要功能：</h3>
            <ul className="space-y-1 text-gray-700 list-disc list-inside">
              <li className="flex gap-2">
                <MessagesSquare className="h-6 w-4" />
                <span>听取对方说的话，对方说完一句就给出回答提示；复盘库里有现成回答时直接显示原文。</span>
              </li>
              <li className="flex gap-2">
                <EyeOff className="h-6 w-4" />
                <span>
                  工具窗口在共享屏幕时自动隐藏(对方不可见)(小部分会议软件可能需要配置才能隐藏)。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <PictureInPicture2 className="h-6 w-4" />
                <span>
                  工具窗口置顶半透明显示，不会抢走会议窗口的焦点。
                </span>
              </li>
            </ul>
          </div>
        </HelpSection>

        {/* Quick Start */}
        <HelpSection Icon={Lightbulb} title="快速开始">
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">1. 填好 AI 和语音的 Key</h3>
            <p className="text-sm text-gray-700">
              在「设置 → AI 模型」填写 AI 平台的 API Key，建议打开「关闭思考」；在「设置 → 语音」填写百炼平台
              API Key，用来识别对方说话。
            </p>
          </div>
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">2. 导入简历和复盘库</h3>
            <p className="text-sm text-gray-700">
              在「设置 → 资料库」导入简历（整份发送）和复盘库（按题检索）。复盘库请用 Word
              的标题样式标出每道题。
            </p>
          </div>
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">3. 开始监听</h3>
            <p className="text-sm text-gray-700">
              按
              <ShortcutRenderer shortcut={`${platformAlt}+T`} className="text-xs mx-1" />
              开始监听。对方说完一句话，右侧就会给出回答提示；按
              <ShortcutRenderer shortcut={`${platformAlt}+G`} className="text-xs mx-1" />
              可以立即出提示。详见下方常见问题。
            </p>
          </div>
        </HelpSection>

        {/* Keyboard Shortcuts */}
        <Shortcuts />

        {/* Overlay Toolbar */}
        <OverlayToolbarHelp />

        {/* FAQ */}
        <FAQ />

        {/* Contact Support */}
        <HelpSection Icon={MessageCircle} title="联系支持">
          <p className="text-gray-700">如果您遇到问题或有建议，可以通过以下方式获得帮助：</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="border border-gray-400 rounded-lg p-4">
              <h3 className="font-semibold mb-2 ">常见问题排查</h3>
              <p className="text-gray-700">
                在{' '}
                <a
                  href="https://github.com/ooboqoo/interview-coder-cn/wiki"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  GitHub Wiki
                </a>{' '}
                上按报错或现象查找原因和解决办法
              </p>
            </div>
            <div className="border border-gray-400 rounded-lg p-4">
              <h3 className="font-semibold mb-2 ">GitHub Issues</h3>
              <p className="text-gray-700">
                在{' '}
                <a
                  href="https://github.com/ooboqoo/interview-coder-cn/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  GitHub Issues
                </a>{' '}
                上提交问题报告和功能请求
              </p>
            </div>
          </div>
        </HelpSection>
      </div>
    </>
  )
}
