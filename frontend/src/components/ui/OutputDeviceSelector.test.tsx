import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { OutputDeviceSelector } from './OutputDeviceSelector'

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }))

vi.mock('@/services/api', () => ({
  ttsApi: { generate: generateMock },
}))

const mockEnumerateDevices = vi.fn()

describe('OutputDeviceSelector', () => {
  const defaultProps = {
    value: '',
    onDeviceChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    generateMock.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: mockEnumerateDevices },
    })
    mockEnumerateDevices.mockResolvedValue([
      { kind: 'audiooutput', deviceId: 'default', label: 'Default Speaker' },
      { kind: 'audiooutput', deviceId: 'cable-1', label: 'CABLE Output (VB-Audio)' },
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Microphone' },
    ])
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders a select with output devices', async () => {
    render(<OutputDeviceSelector {...defaultProps} />)
    // Wait for device enumeration
    await screen.findByDisplayValue('ค่าเริ่มต้น (Default Speaker)')
    expect(screen.getByRole('combobox')).toBeTruthy()
  })

  it('shows selected device by value', async () => {
    render(<OutputDeviceSelector {...defaultProps} value="cable-1" />)
    await screen.findByDisplayValue('CABLE Output (VB-Audio)')
  })

  it('calls onDeviceChange when a device is selected', async () => {
    render(<OutputDeviceSelector {...defaultProps} />)
    await screen.findByDisplayValue('ค่าเริ่มต้น (Default Speaker)')

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'cable-1' } })

    expect(defaultProps.onDeviceChange).toHaveBeenCalledWith('cable-1', 'CABLE Output (VB-Audio)')
  })

  it('shows unsupported message when enumerateDevices is absent', () => {
    // @ts-expect-error testing missing API
    delete navigator.mediaDevices
    render(<OutputDeviceSelector {...defaultProps} />)
    expect(screen.getByText('เบราว์เซอร์ไม่รองรับ')).toBeTruthy()
  })

  it('shows permission button when device labels are empty', async () => {
    mockEnumerateDevices.mockResolvedValue([
      { kind: 'audiooutput', deviceId: 'speakers', label: '' },
    ])
    render(<OutputDeviceSelector {...defaultProps} />)
    await screen.findByText('ขอสิทธิ์ดูชื่ออุปกรณ์')
  })

  it('test button calls ttsApi.generate and plays through selected device', async () => {
    // Mock Audio to track play calls
    const mockPlay = vi.fn().mockResolvedValue(undefined)
    function FakeAudio(this: { play: typeof mockPlay; onended: null; onerror: null; src: string }) {
      this.play = mockPlay
      this.onended = null
      this.onerror = null
      this.src = ''
    }
    vi.stubGlobal('Audio', FakeAudio as any)

    render(<OutputDeviceSelector {...defaultProps} value="cable-1" />)
    await screen.findByDisplayValue('CABLE Output (VB-Audio)')

    const testBtn = screen.getByRole('button', { name: /ทดสอบเสียง|▶/ })
    fireEvent.click(testBtn)

    // Wait for generate to resolve
    await vi.waitFor(() => expect(mockPlay).toHaveBeenCalled())
  })
})