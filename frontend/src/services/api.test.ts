import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import {
  characterApi,
  chatApi,
  healthApi,
  llmStatusApi,
  youtubeChatApi,
  ttsApi,
  outputDeviceApi,
} from './api'

vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }
  return { default: mockAxios }
})

const mockedAxios = axios.create() as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

describe('characterApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAll returns characters', async () => {
    const mockData = [{ id: '1', name: 'Test' }]
    mockedAxios.get.mockResolvedValueOnce({ data: { results: mockData } })
    const result = await characterApi.getAll()
    expect(mockedAxios.get).toHaveBeenCalledWith('/characters/')
    expect(result).toEqual(mockData)
  })

  it('getAll returns data directly if no results key', async () => {
    const mockData = [{ id: '1', name: 'Test' }]
    mockedAxios.get.mockResolvedValueOnce({ data: mockData })
    const result = await characterApi.getAll()
    expect(result).toEqual(mockData)
  })

  it('getById returns character', async () => {
    const mockChar = { id: '1', name: 'Test' }
    mockedAxios.get.mockResolvedValueOnce({ data: mockChar })
    const result = await characterApi.getById('1')
    expect(mockedAxios.get).toHaveBeenCalledWith('/characters/1/')
    expect(result).toEqual(mockChar)
  })

  it('create posts and returns character', async () => {
    const newChar = { name: 'New' }
    const createdChar = { id: '1', ...newChar }
    mockedAxios.post.mockResolvedValueOnce({ data: createdChar })
    const result = await characterApi.create(newChar)
    expect(mockedAxios.post).toHaveBeenCalledWith('/characters/', newChar)
    expect(result).toEqual(createdChar)
  })

  it('update patches and returns character', async () => {
    const updates = { name: 'Updated' }
    const updatedChar = { id: '1', ...updates }
    mockedAxios.patch.mockResolvedValueOnce({ data: updatedChar })
    const result = await characterApi.update('1', updates)
    expect(mockedAxios.patch).toHaveBeenCalledWith('/characters/1/', updates)
    expect(result).toEqual(updatedChar)
  })

  it('delete sends delete request', async () => {
    mockedAxios.delete.mockResolvedValueOnce({})
    await characterApi.delete('1')
    expect(mockedAxios.delete).toHaveBeenCalledWith('/characters/1/')
  })

  it('generatePrompt posts and returns result', async () => {
    const mockResult = { system_prompt_ai: 'test', messages_analyzed: 5, total_messages: 10 }
    mockedAxios.post.mockResolvedValueOnce({ data: mockResult })
    const result = await characterApi.generatePrompt('1')
    expect(mockedAxios.post).toHaveBeenCalledWith('/characters/1/generate-prompt/')
    expect(result).toEqual(mockResult)
  })
})

describe('chatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sendMessage posts and returns response', async () => {
    const request = { character_id: '1', message: 'Hello' }
    const mockResponse = { response: 'Hi!', character_id: '1', message_id: 'msg-1' }
    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse })
    const result = await chatApi.sendMessage(request)
    expect(mockedAxios.post).toHaveBeenCalledWith('/chat/', request)
    expect(result).toEqual(mockResponse)
  })
})

describe('healthApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('check returns health status', async () => {
    const mockHealth = { status: 'ok', llm_api: 'connected' }
    mockedAxios.get.mockResolvedValueOnce({ data: mockHealth })
    const result = await healthApi.check()
    expect(mockedAxios.get).toHaveBeenCalledWith('/health/')
    expect(result).toEqual(mockHealth)
  })
})

describe('llmStatusApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getProviders returns providers', async () => {
    const mockProviders = [{ id: '1', name: 'Provider' }]
    mockedAxios.get.mockResolvedValueOnce({ data: { results: mockProviders } })
    const result = await llmStatusApi.getProviders()
    expect(mockedAxios.get).toHaveBeenCalledWith('/llm-providers/')
    expect(result).toEqual(mockProviders)
  })

  it('createProvider posts and returns provider', async () => {
    const newProvider = { name: 'New', api_url: 'http://test' }
    const created = { id: '1', ...newProvider }
    mockedAxios.post.mockResolvedValueOnce({ data: created })
    const result = await llmStatusApi.createProvider(newProvider)
    expect(mockedAxios.post).toHaveBeenCalledWith('/llm-providers/', newProvider)
    expect(result).toEqual(created)
  })

  it('updateProvider patches and returns provider', async () => {
    const updates = { name: 'Updated' }
    const updated = { id: '1', ...updates }
    mockedAxios.patch.mockResolvedValueOnce({ data: updated })
    const result = await llmStatusApi.updateProvider('1', updates)
    expect(mockedAxios.patch).toHaveBeenCalledWith('/llm-providers/1/', updates)
    expect(result).toEqual(updated)
  })
})

describe('youtubeChatApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('startSession posts and returns session', async () => {
    const mockSession = { id: '1', video_id: 'abc123', status: 'active' }
    mockedAxios.post.mockResolvedValueOnce({ data: mockSession })
    const result = await youtubeChatApi.startSession('abc123', 'char-1', true)
    expect(mockedAxios.post).toHaveBeenCalledWith('/yt-chat/start/', {
      video_id: 'abc123',
      character_id: 'char-1',
      auto_reply: true,
    })
    expect(result).toEqual(mockSession)
  })

  it('stopSession posts and returns status', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { status: 'stopped' } })
    const result = await youtubeChatApi.stopSession()
    expect(mockedAxios.post).toHaveBeenCalledWith('/yt-chat/stop/')
    expect(result).toEqual({ status: 'stopped' })
  })

  it('getStatus returns session status', async () => {
    const mockStatus = { active: true, id: '1' }
    mockedAxios.get.mockResolvedValueOnce({ data: mockStatus })
    const result = await youtubeChatApi.getStatus()
    expect(mockedAxios.get).toHaveBeenCalledWith('/yt-chat/status/')
    expect(result).toEqual(mockStatus)
  })

  it('getMessages returns messages for session', async () => {
    const mockMessages = { results: [{ id: '1', text: 'Hello' }] }
    mockedAxios.get.mockResolvedValueOnce({ data: mockMessages })
    const result = await youtubeChatApi.getMessages('session-1')
    expect(mockedAxios.get).toHaveBeenCalledWith('/yt-messages/?session_id=session-1')
    expect(result).toEqual(mockMessages)
  })

  it('getSessions returns session history', async () => {
    const mockSessions = { results: [{ id: '1' }] }
    mockedAxios.get.mockResolvedValueOnce({ data: mockSessions })
    const result = await youtubeChatApi.getSessions()
    expect(mockedAxios.get).toHaveBeenCalledWith('/yt-sessions/')
    expect(result).toEqual(mockSessions)
  })
})

describe('ttsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generate posts and returns blob', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    mockedAxios.post.mockResolvedValueOnce({ data: mockBlob })
    const result = await ttsApi.generate('Hello', 'voice-1', '+0%')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/tts/generate/',
      { text: 'Hello', voice: 'voice-1', rate: '+0%' },
      { responseType: 'blob' }
    )
    expect(result).toEqual(mockBlob)
  })

  it('generate defaults to piper th_TH-tsync2-medium voice', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    mockedAxios.post.mockResolvedValueOnce({ data: mockBlob })
    await ttsApi.generate('Hello')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/tts/generate/',
      { text: 'Hello', voice: 'th_TH-tsync2-medium', rate: '+0%' },
      { responseType: 'blob' }
    )
  })

  it('getVoices returns voices', async () => {
    const mockVoices = {
      voices: { thai: [{ id: 'th-1', name: 'Thai Voice' }] },
      default_voice: 'th-1',
    }
    mockedAxios.get.mockResolvedValueOnce({ data: mockVoices })
    const result = await ttsApi.getVoices()
    expect(mockedAxios.get).toHaveBeenCalledWith('/tts/voices/', { params: {} })
    expect(result).toEqual(mockVoices)
  })

  it('getVoices with language param', async () => {
    const mockVoices = { voices: {}, default_voice: 'en-1' }
    mockedAxios.get.mockResolvedValueOnce({ data: mockVoices })
    await ttsApi.getVoices('english')
    expect(mockedAxios.get).toHaveBeenCalledWith('/tts/voices/', { params: { language: 'english' } })
  })

  it('chatMessage posts and returns blob', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    mockedAxios.post.mockResolvedValueOnce({ data: mockBlob })
    const result = await ttsApi.chatMessage('Hello', 'char-1', 'voice-1', '+0%')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/tts/chat-message/',
      { text: 'Hello', character_id: 'char-1', voice: 'voice-1', rate: '+0%' },
      { responseType: 'blob' }
    )
    expect(result).toEqual(mockBlob)
  })
})

describe('outputDeviceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getCurrent returns the current device', async () => {
    const mockData = { device: { device_id: 'cable-1', name: 'Cable Output' } }
    mockedAxios.get.mockResolvedValueOnce({ data: mockData })
    const result = await outputDeviceApi.getCurrent()
    expect(mockedAxios.get).toHaveBeenCalledWith('/output-devices/current/')
    expect(result).toEqual(mockData)
  })

  it('getCurrent returns null device when none selected', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { device: null } })
    const result = await outputDeviceApi.getCurrent()
    expect(result).toEqual({ device: null })
  })

  it('capture posts device info', async () => {
    const mockResult = { success: true }
    mockedAxios.post.mockResolvedValueOnce({ data: mockResult })
    const result = await outputDeviceApi.capture('cable-1', 'CABLE Output', 'windows')
    expect(mockedAxios.post).toHaveBeenCalledWith('/output-devices/capture/', {
      device_id: 'cable-1',
      label: 'CABLE Output',
      platform: 'windows',
    })
    expect(result).toEqual(mockResult)
  })

  it('capture uses deviceId as fallback label', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } })
    await outputDeviceApi.capture('dev-1')
    expect(mockedAxios.post).toHaveBeenCalledWith('/output-devices/capture/', {
      device_id: 'dev-1',
      label: 'dev-1',
      platform: 'unknown',
    })
  })
})
