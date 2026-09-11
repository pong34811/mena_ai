import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { TtsConfigModal } from './TtsConfigModal'

const mockVoices = {
  voices: {
    thai: [{ id: 'th_TH-tsync2-medium', name: 'Thai Female (tsync2)', gender: 'Female' }],
  },
  default_voice: 'th_TH-tsync2-medium',
}

describe('TtsConfigModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    userTtsEnabled: true,
    setUserTtsEnabled: vi.fn(),
    userTtsVoice: 'th_TH-tsync2-medium',
    setUserTtsVoice: vi.fn(),
    aiTtsEnabled: true,
    setAiTtsEnabled: vi.fn(),
    aiTtsVoice: 'th_TH-tsync2-medium',
    setAiTtsVoice: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVoices),
    }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nothing when isOpen is false', () => {
    render(<TtsConfigModal {...defaultProps} isOpen={false} />)
    expect(screen.queryByText('TTS Settings')).toBeNull()
  })

  it('renders modal when isOpen is true', () => {
    render(<TtsConfigModal {...defaultProps} />)
    expect(screen.getByText('TTS Settings')).toBeTruthy()
    expect(screen.getByText('ผู้ถาม (User)')).toBeTruthy()
    expect(screen.getByText('ผู้ตอบ (AI)')).toBeTruthy()
  })

  it('calls onClose when close button is clicked', () => {
    render(<TtsConfigModal {...defaultProps} />)
    fireEvent.click(screen.getByText('เสร็จสิ้น'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('toggles user TTS enabled', () => {
    render(<TtsConfigModal {...defaultProps} />)
    const buttons = screen.getAllByText('เปิด')
    fireEvent.click(buttons[0])
    expect(defaultProps.setUserTtsEnabled).toHaveBeenCalledWith(false)
  })

  it('toggles AI TTS enabled', () => {
    render(<TtsConfigModal {...defaultProps} />)
    const buttons = screen.getAllByText('เปิด')
    fireEvent.click(buttons[1])
    expect(defaultProps.setAiTtsEnabled).toHaveBeenCalledWith(false)
  })

  it('loads voices from API on open', async () => {
    render(<TtsConfigModal {...defaultProps} />)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/tts/voices/')
    })
  })

  it('shows loading state while fetching voices', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))) // never resolves
    render(<TtsConfigModal {...defaultProps} />)
    // Both user and AI sections show loading while fetching
    expect(screen.getAllByText('กำลังโหลดรายการเสียง...').length).toBeGreaterThan(0)
  })

  it('renders voice selects after loading', async () => {
    render(<TtsConfigModal {...defaultProps} />)
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })
  })

  it('calls setUserTtsVoice when user voice is changed', async () => {
    render(<TtsConfigModal {...defaultProps} />)
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'th_TH-tsync2-medium' } })
    expect(defaultProps.setUserTtsVoice).toHaveBeenCalledWith('th_TH-tsync2-medium')
  })

  it('calls setAiTtsVoice when AI voice is changed', async () => {
    render(<TtsConfigModal {...defaultProps} />)
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox')
      expect(selects).toHaveLength(2)
    })
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'th_TH-tsync2-medium' } })
    expect(defaultProps.setAiTtsVoice).toHaveBeenCalledWith('th_TH-tsync2-medium')
  })

  it('handles API error gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<TtsConfigModal {...defaultProps} />)
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load TTS voices:', expect.any(Error))
    })
    consoleSpy.mockRestore()
  })
})
