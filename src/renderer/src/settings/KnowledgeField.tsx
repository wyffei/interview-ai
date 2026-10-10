import { cn } from '@/lib/utils'
import { formatChars, knowledgeUsage, useKnowledgeDocs } from '@/lib/knowledge'
import { Field } from './components'

/** What the 资料库 contributes to hints, with the way to it; the material itself is managed there */
export function KnowledgeField({ onOpen }: { onOpen: () => void }) {
  const [docs] = useKnowledgeDocs()
  const usage = docs && knowledgeUsage(docs)

  return (
    <Field
      label="参考资料"
      note="简历等整份发送的资料随每次请求发给 AI；复盘库等按题检索的资料只发和问题相关的几条"
    >
      <button
        className={cn(
          'max-w-60 shrink-0 truncate text-xs transition-colors cursor-pointer hover:underline',
          usage?.over ? 'text-amber-800' : 'text-blue-700'
        )}
        onClick={onOpen}
      >
        {!usage
          ? ''
          : usage.count + usage.searched > 0
            ? [
                usage.count > 0 &&
                  `${usage.count} 份 · ${formatChars(usage.chars)}${usage.over ? '（超过建议上限）' : ''}`,
                usage.searched > 0 && `${usage.searched} 份按题检索`
              ]
                .filter(Boolean)
                .join(' + ')
            : '未使用，去资料库添加'}
      </button>
    </Field>
  )
}
