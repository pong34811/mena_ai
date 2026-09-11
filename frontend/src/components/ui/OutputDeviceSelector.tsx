import { useCallback, useEffect, useState } from 'react'
import { Button } from './Button'
import { ttsApi } from '@/services/api'

interface AudioOutputDevice {
  deviceId: string
  label: string
}

interface OutputDeviceSelectorProps {
  value: string
  onDeviceChange: (deviceId: string, label?: string) => void
}

export function OutputDeviceSelector({ value, onDeviceChange }: OutputDeviceSelectorProps) {
  const [supported, setSupported] = useState(true)
  const [devices, setDevices] = useState<AudioOutputDevice[]>([])
  const [testing, setTesting] = useState(false)
  const [permissionNeeded, setPermissionNeeded] = useState(false)

  const detectOutputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setSupported(false)
      return
    }
    try {
      const audio = document.createElement('audio') as HTMLAudioElement & { setSinkId?: unknown }
      if (typeof audio.setSinkId !== 'function') {
        setSupported(false)
        return
      }
      const enumerated = await navigator.mediaDevices.enumerateDevices()
      const outputs: AudioOutputDevice[] = enumerated
        .filter((d) => d.kind === 'audiooutput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${i + 1}`,
        }))
      setDevices(outputs)
      // If at least one device has a real label, permission was already granted
      setPermissionNeeded(outputs.some((d) => !d.label.startsWith('Speaker ')) === false)
    } catch (err) {
      console.error('Failed to enumerate audio devices:', err)
      setSupported(false)
    }
  }, [])

  useEffect(() => {
    detectOutputs()
  }, [detectOutputs])

  const testSink = useCallback(async () => {
    if (testing || !value) return
    setTesting(true)
    try {
      const blob = await ttsApi.generate('สวัสดีค่ะ นี่คือเสียงทดสอบ')
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      if (typeof (audio as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === 'function') {
        try {
          await (audio as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(value)
        } catch (err) {
          console.warn('Failed to set sink for test audio:', err)
        }
      }
      const cleanup = () => {
        URL.revokeObjectURL(url)
        setTesting(false)
      }
      audio.onended = cleanup
      audio.onerror = () => {
        console.error('Test audio error')
        cleanup()
      }
      await audio.play()
    } catch (err) {
      console.error('Test output device failed:', err)
      setTesting(false)
    }
  }, [testing, value])

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      await detectOutputs()
    } catch (err) {
      console.error('Failed to get audio permission:', err)
    }
  }, [detectOutputs])

  if (!supported) {
    return (
      <span
        data-testid="output-device-unsupported"
        className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded"
        title="เบราว์เซอร์ไม่รองรับการเลือก output device — ใช้ Chrome หรือ Edge"
      >
        เบราว์เซอร์ไม่รองรับ
      </span>
    )
  }

  return (
    <div data-testid="output-device-selector" className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => {
          const opt = e.target.selectedOptions[0]
          onDeviceChange(e.target.value, opt?.textContent || e.target.value)
        }}
        className="max-w-[180px] bg-surface-light border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-primary"
        title="เลือก output device สำหรับ TTS"
      >
        <option value="">ค่าเริ่มต้น (Default Speaker)</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      {permissionNeeded && devices.length > 0 && (
        <Button size="sm" variant="outline" onClick={requestPermission} className="h-6 px-1.5 text-xs" title="ขอสิทธิ์ดูชื่ออุปกรณ์">
          ขอสิทธิ์ดูชื่ออุปกรณ์
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={testSink}
        disabled={testing || !value}
        className="h-6 px-1.5 text-xs"
        title="ทดสอบเสียงผ่านอุปกรณ์ที่เลือก"
      >
        {testing ? '🔊' : '▶'}
      </Button>
    </div>
  )
}