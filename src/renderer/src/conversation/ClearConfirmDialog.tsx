import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

/**
 * 「清空对话」 with a 面试准备 on hand: keep it (a microphone test before the
 * interview) or end it with the interview. Main asks only when there is one
 * (see main `requestClear`)
 */
export function ClearConfirmDialog() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    window.api.onConversationConfirmClear(() => setOpen(true))
  }, [])

  const clear = (keepBriefing: boolean) => {
    setOpen(false)
    void window.api.clearConversation(keepBriefing)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>清空对话</DialogTitle>
          <DialogDescription>
            还有这场面试的准备（简历、公司与 JD、行业卡片、自我介绍），要一起清掉吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button variant="secondary" onClick={() => clear(true)}>
            只清空对话
          </Button>
          <Button onClick={() => clear(false)}>连同面试准备一起清空</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
