import { BookOpen } from 'lucide-react'
import { HelpSection } from './components'

const faqs = [
  {
    question: '怎么开始用？',
    answer: (
      <span>
        先在「设置 → AI 模型」填写 AI 平台的 API
        Key（出提示的配置建议把「思考」设为「关闭思考」），在「设置 → 语音」填写百炼平台 API
        Key，然后点工具条上的「开始监听」。它采集的是系统音频（会议里对方的声音），自己说话不会触发提示。
      </span>
    )
  },
  {
    question: '提示什么时候出？',
    answer: (
      <span>
        默认「自动」出提示：对方说完一句话就立即生成，如果对方其实还没说完，会等说完后重新生成；
        也可以随时点工具条上的「出提示」立即出提示（没有新内容时换个说法重出），或点「自动/手动」
        切换为「手动」，只在点「出提示」时出。
      </span>
    )
  },
  {
    question: '提示里显示「API 调用失败」，或一直显示正在生成？',
    answer: (
      <span>
        先看提示卡片上的报错原文。最常见的原因是「设置 → AI 模型」里的三项和平台对不上：API Base URL
        大多以 /v1 结尾，不要带上 /chat/completions；API Key
        要和地址属于同一个平台；模型名按平台文档一字不差地填。各种报错的原因和解决办法见{' '}
        <a
          href="https://github.com/ooboqoo/interview-coder-cn/wiki/AI模型配置与调用失败"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          GitHub Wiki
        </a>
        。
      </span>
    )
  },
  {
    question: '能让 AI 参考我的简历和复盘库吗？',
    answer: (
      <span>
        可以。在「设置 →
        资料库」导入文件（PDF、Word、Markdown、TXT），或把准备好的问答直接粘贴成文本。简历这类短资料选「整份发送」，
        每次请求都会带上；复盘库这类长资料选「按题检索」：每听到一个问题先在复盘库里查，有现成回答就直接显示原文，
        问法相近就交给 AI 改写，没准备过就只把最相关的几条发给 AI。复盘库请用 Word 的「标题
        1/2/3」样式标出每道题。资料只保存在本机，但会随请求发给你配置的 AI 平台。
      </span>
    )
  },
  {
    question: '分享屏幕时，对方能看到应用吗？',
    answer: (
      <span>
        工具窗口在共享屏幕时自动隐藏(对方不可见)，但小部分会议软件可能需要配置才能隐藏。所以如果你对隐身功能有需求，务必在正式使用前用「当前电脑」+「当前会议软件」测试一下。相关讨论见{' '}
        <a
          href="https://github.com/ooboqoo/interview-coder-cn/issues/21"
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline"
        >
          GitHub Issue #21
        </a>
        。
      </span>
    )
  },
  {
    question: '鼠标移过窗口时，光标会不会变？',
    answer: (
      <span>
        本工具提供了开关，可以开启或关闭鼠标穿透。开启鼠标穿透时，主窗口对鼠标隐身，但上方的工具条照常可以点：
        点工具条上的「鼠标穿透」开启，点「取消穿透」关闭。
      </span>
    )
  },
  {
    question: '有快捷键吗？',
    answer: (
      <span>
        没有。应用不注册任何快捷键，所有操作都用主窗口上方「悬浮工具条」的按钮完成，点击不会让会议窗口失焦。
        各按钮的含义见上方「悬浮工具条」章节。
      </span>
    )
  },
  {
    question: '怎么清空对话重新开始？',
    answer: (
      <span>
        点提示区右上角的「清空对话」。开启「设置 → 出提示 →
        保存对话记录到本地」后，清空前的对话会保存为 Markdown 文件，方便面试后复盘。
      </span>
    )
  }
]

export function FAQ() {
  return (
    <HelpSection Icon={BookOpen} title="常见问题">
      {faqs.map((faq, index) => (
        <div key={index} className="border border-gray-400 rounded-lg p-4">
          <h3 className="font-semibold mb-2">{faq.question}</h3>
          <p className="text-sm text-gray-700">{faq.answer}</p>
        </div>
      ))}
    </HelpSection>
  )
}
