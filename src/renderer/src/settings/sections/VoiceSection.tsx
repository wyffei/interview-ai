import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useSettingsStore } from '@/lib/store/settings'
import { Advanced, Field, SecretInput, SettingsCard } from '../components'

/** Speech recognition, which hearing the other side is built on */
export function VoiceSection() {
  const {
    dashscopeApiKey,
    phoneMode,
    phoneAutoMe,
    audioInputDeviceId,
    audioOutputDeviceId,
    updateSetting
  } = useSettingsStore()
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  // Device names come only after a microphone permission, so ask for it only
  // once a microphone is wanted
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const needsPermission = devices.every((d) => !d.label)
        if (needsPermission && phoneMode) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          // Only the permission was wanted; an open track keeps the microphone in use
          stream.getTracks().forEach((t) => t.stop())
        }
        const refreshed = await navigator.mediaDevices.enumerateDevices()
        setAudioDevices(refreshed)
      } catch (err) {
        console.error('Failed to enumerate audio devices:', err)
      }
    }
    loadDevices()
  }, [phoneMode])

  return (
    <SettingsCard Icon={Mic} title="语音">
      <div className="space-y-4">
        <Field
          label="百炼平台 API Key"
          note={
            <>
              从阿里云
              <a
                href="https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="px-0.5 text-blue-700 hover:underline"
              >
                百炼平台
              </a>
              获取；必填，用来识别对方说话
            </>
          }
        >
          <SecretInput
            value={dashscopeApiKey}
            onChange={(value) => updateSetting('dashscopeApiKey', value)}
            placeholder="输入百炼平台 API Key"
          />
        </Field>

        <Field
          label="手机面试模式"
          note={
            phoneMode
              ? '用麦克风收听手机外放（如微信 AI 面试小程序），会同时听到你自己；用工具栏的「对方在说 / 我在说」告诉它谁在说话，你说的话只作上下文、不出提示。下次开始监听时生效'
              : '关闭时收听电脑的系统音频，即线上会议里对方的声音。手机上面试时开启'
          }
        >
          <Switch
            className="scale-y-90"
            checked={phoneMode}
            onCheckedChange={(checked) => updateSetting('phoneMode', checked)}
          />
        </Field>

        {phoneMode && (
          <>
            <Field label="麦克风" note="放在手机扬声器旁边的那个">
              <Select
                value={audioInputDeviceId || 'default'}
                onValueChange={(val) =>
                  updateSetting('audioInputDeviceId', val === 'default' ? '' : val)
                }
              >
                <SelectTrigger className="w-60 shrink-0 bg-white">
                  <SelectValue placeholder="系统默认麦克风" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">系统默认麦克风</SelectItem>
                  {audioDevices
                    // Chromium lists the default again under the id 'default'
                    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
                    .map((d) => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="出提示后自动切到「我在说」"
              note="提示一出来就认为接下来是你在回答；对方再提问时按一下「对方在说」。关闭则完全手动切换"
            >
              <Switch
                className="scale-y-90"
                checked={phoneAutoMe}
                onCheckedChange={(checked) => updateSetting('phoneAutoMe', checked)}
              />
            </Field>
          </>
        )}

        <Advanced defaultOpen={!!audioOutputDeviceId}>
          <Field label="音频输出设备" note="用于转录时的监听输出">
            <Select
              value={audioOutputDeviceId || 'default'}
              onValueChange={(val) =>
                updateSetting('audioOutputDeviceId', val === 'default' ? '' : val)
              }
            >
              <SelectTrigger className="w-60 shrink-0 bg-white">
                <SelectValue placeholder="默认设备" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">默认设备</SelectItem>
                {audioDevices
                  .filter((d) => d.kind === 'audiooutput')
                  .map((d) => (
                    <SelectItem key={d.deviceId} value={d.deviceId}>
                      {d.label || d.deviceId}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
        </Advanced>
      </div>
    </SettingsCard>
  )
}
