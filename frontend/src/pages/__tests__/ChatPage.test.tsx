/**
 * Tests for ChatPage component.
 *
 * Uses React Testing Library with mocked API, hooks, and lucide icons.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ChatPage from '../ChatPage';
import { characterApi, chatApi, youtubeChatApi } from '@/services/api';

// Mock API modules
vi.mock('@/services/api', () => ({
  characterApi: {
    getAll: vi.fn(),
  },
  chatApi: {
    sendMessage: vi.fn(),
  },
  youtubeChatApi: {
    getStatus: vi.fn(),
    startSession: vi.fn(),
    stopSession: vi.fn(),
  },
}));

// Mock useHowlerTTS hook
const mockTts = vi.hoisted(() => ({
  settings: {
    questioner_enabled: true,
    responder_enabled: true,
    questioner_voice: 'th_TH-tsync2-medium',
    responder_voice: 'th_TH-tsync2-medium',
  },
  speakExchange: vi.fn(),
  currentItem: null,
  clearQueue: vi.fn(),
  unlockAudio: vi.fn(),
  skip: vi.fn(),
  reloadSettings: vi.fn(),
}));

vi.mock('@/hooks/useHowlerTTS', () => ({
  useHowlerTTS: () => mockTts,
}));

// Mock useChatWebSocket hook
vi.mock('@/hooks/useChatWebSocket', () => ({
  useChatWebSocket: () => ({
    sendChat: vi.fn(() => false),
    isConnected: false,
  }),
}));

// Mock useYouTubeWebSocket hook
vi.mock('@/hooks/useYouTubeWebSocket', () => ({
  useYouTubeWebSocket: () => undefined,
}));

// Mock TtsConfigModal
vi.mock('@/components/ui/TtsConfigModal', () => ({
  TtsConfigModal: () => <div data-testid="tts-modal">TTS Modal</div>,
}));

// Mock lucide icons so we can locate icon-only buttons by test id.
// NOTE: no JSX inside the factory — the transformed jsx-runtime import is
// not initialized yet when vi.mock factories run.
// Mock lucide icons so we can locate icon-only buttons by test id.
// Wrap every real export as a test-id svg (a plain object keeps the export
// keys enumerable for Vitest; no JSX inside the factory).
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { createElement } = await import('react');
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    out[key] = () => createElement('svg', { 'data-testid': `icon-${key}` });
  }
  return out;
});

describe('ChatPage', () => {
  const mockCharacters = [
    {
      id: 'char-1',
      name: 'Mena',
      name_th: 'มีนา',
      name_en: 'Mena',
      description: 'Friendly VTuber',
      system_prompt: 'You are Mena',
      system_prompt_ai: '',
      avatar_url: '',
      avatar_border_color: '#ffffff',
      response_language: 'thai',
      response_length: 'short',
      enable_per_user_memory: true,
      memory_duration_days: 3,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'char-2',
      name: 'Kai',
      name_th: 'ไค',
      name_en: 'Kai',
      description: 'Cool guy',
      system_prompt: 'You are Kai',
      system_prompt_ai: '',
      avatar_url: '',
      avatar_border_color: '#ffffff',
      response_language: 'thai',
      response_length: 'normal',
      enable_per_user_memory: true,
      memory_duration_days: 7,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (characterApi.getAll as any).mockResolvedValue(mockCharacters);
    (youtubeChatApi.getStatus as any).mockResolvedValue({ active: false });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    );
  });

  const renderChatPage = () =>
    render(
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>
    );

  it('shows empty state when no characters exist', async () => {
    (characterApi.getAll as any).mockResolvedValue([]);
    renderChatPage();

    await waitFor(() => {
      expect(screen.getByText('No characters yet')).toBeInTheDocument();
    });
  });

  it('loads and displays characters', async () => {
    renderChatPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Characters' })).toBeInTheDocument();
    });
    expect(screen.getByText('มีนา')).toBeInTheDocument();
    expect(screen.getByText('ไค')).toBeInTheDocument();
  });

  it('selects first character by default', async () => {
    renderChatPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    const selectedButton = screen.getByText('มีนา').closest('button');
    expect(selectedButton?.className).toContain('bg-primary/20');
  });

  it('allows selecting a different character', async () => {
    renderChatPage();

    await waitFor(() => {
      expect(screen.getByText('ไค')).toBeInTheDocument();
    });

    const kaiButton = screen.getByText('ไค').closest('button');
    fireEvent.click(kaiButton!);

    expect(kaiButton?.className).toContain('bg-primary/20');
  });

  it('displays chat input when character is selected', async () => {
    renderChatPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message มีนา/)).toBeInTheDocument();
    });
  });

  it('sends a message via HTTP fallback and shows the reply', async () => {
    (chatApi.sendMessage as any).mockResolvedValue({
      message_id: 'msg-123',
      response: 'สวัสดีครับ!',
    });

    renderChatPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message มีนา/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Message มีนา/);
    fireEvent.change(input, { target: { value: 'Hello' } });

    const sendButton = screen.getByTestId('icon-Send').closest('button');
    fireEvent.click(sendButton!);

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith({
        character_id: 'char-1',
        message: 'Hello',
        user_name: 'Dev',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('สวัสดีครับ!')).toBeInTheDocument();
    });

    // TTS exchange should be spoken for the completed reply
    expect(mockTts.speakExchange).toHaveBeenCalledWith(
      expect.objectContaining({ responder_text: 'สวัสดีครับ!' })
    );
  });

  it('shows error when sending fails', async () => {
    (chatApi.sendMessage as any).mockRejectedValue({
      response: { data: { error: 'API is down' } },
    });

    renderChatPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message มีนา/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Message มีนา/);
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('icon-Send').closest('button')!);

    await waitFor(() => {
      expect(screen.getByText('API is down')).toBeInTheDocument();
    });
  });

  it('sends message on Enter key', async () => {
    (chatApi.sendMessage as any).mockResolvedValue({
      message_id: 'msg-123',
      response: 'Reply!',
    });

    renderChatPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message มีนา/)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Message มีนา/);
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalled();
    });
  });

  it('shows YouTube chat panel when toggled', async () => {
    renderChatPage();

    const ytToggle = screen.getByRole('button', { name: /YouTube Live Chat/ });
    act(() => {
      fireEvent.click(ytToggle);
    });

    expect(screen.getByPlaceholderText('YouTube URL or Video ID')).toBeInTheDocument();
  });

  it('toggles TTS setting via API', async () => {
    renderChatPage();

    const ttsButton = screen.getByRole('button', { name: /TTS On/ });
    fireEvent.click(ttsButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/tts/settings/update/',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    // Turning off clears the speech queue
    expect(mockTts.clearQueue).toHaveBeenCalled();
  });

  it('displays user name input with default', async () => {
    renderChatPage();

    // The input bar only renders once a character is selected (after load).
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Message มีนา/)).toBeInTheDocument();
    });

    const userNameInput = screen.getByPlaceholderText('Your name (for memory)');
    expect(userNameInput).toBeInTheDocument();
    expect(userNameInput).toHaveValue('Dev');
  });
});
