import { useSettingsStore } from '@/lib/store/settings'
import { isMac } from '@/lib/utils/env'

let mediaStream: MediaStream | null = null
let audioContext: AudioContext | null = null
let processor: ScriptProcessorNode | null = null

function downsampleAndSend(float32: Float32Array): void {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  window.api.sendTranscriptionAudioChunk(int16.buffer)
}

/** Blank `deviceId` is the system's default microphone */
async function openMicrophoneStream(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false
  })
}

async function openSystemAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  })
  stream.getVideoTracks().forEach((t) => t.stop())
  return stream
}

/**
 * System audio (the other side of an online call), or in 手机面试模式 the
 * picked microphone. A microphone that will not open is an error, not a quiet
 * switch to system audio: the user would be listening to the wrong thing.
 */
export async function startAudioCapture(): Promise<void> {
  const { phoneMode, audioInputDeviceId, audioOutputDeviceId } = useSettingsStore.getState()

  const stream = phoneMode
    ? await openMicrophoneStream(audioInputDeviceId)
    : await openSystemAudioStream()

  mediaStream = stream

  audioContext = new AudioContext({ sampleRate: 16000 })

  if (audioOutputDeviceId && 'setSinkId' in audioContext) {
    try {
      await (audioContext as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        audioOutputDeviceId
      )
    } catch (err) {
      console.warn('Failed to set audio output device:', err)
    }
  }

  const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))

  processor = audioContext.createScriptProcessor(2048, 1, 1)
  processor.onaudioprocess = (e) => {
    downsampleAndSend(e.inputBuffer.getChannelData(0))
  }
  source.connect(processor)
  processor.connect(audioContext.destination)
}

/**
 * The message for a capture that failed to start. System audio is taken from a
 * screen capture, so on macOS it needs 屏幕与系统音频录制, granted to this app
 * and in effect only after a restart. The error itself is appended: in a
 * packaged app it is the only clue a user's report can carry.
 */
export function describeCaptureError(err: unknown): string {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  if (useSettingsStore.getState().phoneMode) {
    return `无法打开麦克风，请检查麦克风权限，或到「设置 → 语音」重新选择输入设备（${detail}）`
  }
  const hint = isMac
    ? '：请在「系统设置 → 隐私与安全性 → 屏幕与系统音频录制」中允许本应用，然后完全退出（⌘Q）再重新打开'
    : '，请检查系统音频权限'
  return `启动语音识别失败${hint}（${detail}）`
}

export function stopAudioCapture(): void {
  if (processor) {
    processor.disconnect()
    processor = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
}
