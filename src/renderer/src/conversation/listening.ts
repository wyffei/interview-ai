import { toast } from 'sonner'
import { useSettingsStore } from '@/lib/store/settings'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { useConversationStore } from '@/lib/store/conversation'
import { useAppStore } from '@/lib/store/app'
import { describeCaptureError, startAudioCapture, stopAudioCapture } from '@/lib/audio-capture'

/**
 * Listening to the other side: the audio is captured here and recognised in
 * main, which turns each sentence into the conversation. It keeps running
 * while the settings or help page is open, so adjusting something mid-call
 * does not drop what is being said.
 */
export async function startListening(): Promise<void> {
  const { dashscopeApiKey, conversationSilenceMs } = useSettingsStore.getState()
  if (!dashscopeApiKey) {
    reportListeningError('请先在「设置 → 语音」填写百炼平台 API Key，才能识别对方说话')
    return
  }
  try {
    await startAudioCapture()
    await window.api.startTranscription(dashscopeApiKey, {
      maxSentenceSilence: conversationSilenceMs
    })
    useTranscriptionStore.getState().setIsTranscribing(true)
    useConversationStore.getState().setErrorMessage(null)
  } catch (err) {
    console.error('Failed to start listening:', err)
    stopAudioCapture()
    reportListeningError(describeCaptureError(err))
  }
}

/**
 * Put a listening failure on the conversation page, and, when another page is
 * on screen (截图模式, the settings), in a toast too: the conversation page
 * is where it would otherwise only be found later
 */
function reportListeningError(message: string): void {
  useConversationStore.getState().setErrorMessage(message)
  if (!useAppStore.getState().inConversationPage) {
    toast.error('对话模式的监听出错', { description: message, duration: 8000 })
  }
}

/**
 * Follow listening for the main window's whole life, so the toolbar's
 * listening button works on 截图模式's page too, and recognition ending there
 * is noticed at once; returns the unsubscribe
 */
export function followListening(): () => void {
  const transcription = useTranscriptionStore.getState()
  window.api.onToggleTranscription(toggleListening)
  window.api.onTranscriptionError((message) => {
    stopAudioCapture()
    transcription.setIsTranscribing(false)
    reportListeningError(message)
  })
  window.api.onTranscriptionStopped(() => {
    stopAudioCapture()
    transcription.setIsTranscribing(false)
  })
  return () => {
    window.api.removeToggleTranscriptionListener()
    window.api.removeTranscriptionErrorListener()
    window.api.removeTranscriptionStoppedListener()
  }
}

export async function stopListening(): Promise<void> {
  stopAudioCapture()
  await window.api.stopTranscription()
  useTranscriptionStore.getState().setIsTranscribing(false)
}

export function toggleListening(): void {
  if (useTranscriptionStore.getState().isTranscribing) void stopListening()
  else void startListening()
}

export function toggleHintMode(): void {
  const { conversationHintMode, updateSetting } = useSettingsStore.getState()
  const next = conversationHintMode === 'auto' ? 'manual' : 'auto'
  updateSetting('conversationHintMode', next)
  toast(next === 'auto' ? '已切换为自动出提示' : '已切换为手动出提示', {
    description:
      next === 'auto'
        ? '对方说完一句话就出提示，也可随时点「出提示」'
        : '只在点工具条上的「出提示」时出提示',
    duration: 3000
  })
}
