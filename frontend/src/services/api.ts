// API service for communicating with Django backend

import axios from 'axios';
import type { Character, ChatMessage, ChatRequest, ChatResponse, HealthResponse, LLMProvider, LLMStatus } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'charset': 'utf-8',
  },
});

export const characterApi = {
  getAll: async (): Promise<Character[]> => {
    const { data } = await api.get('/characters/');
    return data.results || data;
  },

  getById: async (id: string): Promise<Character> => {
    const { data } = await api.get(`/characters/${id}/`);
    return data;
  },

  create: async (character: Partial<Character>): Promise<Character> => {
    const { data } = await api.post('/characters/', character);
    return data;
  },

  update: async (id: string, character: Partial<Character>): Promise<Character> => {
    const { data } = await api.patch(`/characters/${id}/`, character);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/characters/${id}/`);
  },

  generatePrompt: async (id: string): Promise<{ system_prompt_ai: string; messages_analyzed: number; total_messages: number }> => {
    const { data } = await api.post(`/characters/${id}/generate-prompt/`);
    return data;
  },
};

export const chatApi = {
  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const { data } = await api.post('/chat/', request);
    return data;
  },

  getMessages: async (): Promise<ChatMessage[]> => {
    const { data } = await api.get('/messages/');
    return data.results || data;
  },
};

export const healthApi = {
  check: async (): Promise<HealthResponse> => {
    const { data } = await api.get('/health/');
    return data;
  },
};

export const llmStatusApi = {
  getStatus: async (): Promise<LLMStatus> => {
    const { data } = await api.get('/llm-status/');
    return data;
  },

  getProviders: async (): Promise<LLMProvider[]> => {
    const { data } = await api.get('/llm-providers/');
    return data.results || data;
  },

  createProvider: async (provider: Partial<LLMProvider>): Promise<LLMProvider> => {
    const { data } = await api.post('/llm-providers/', provider);
    return data;
  },

  updateProvider: async (id: string, provider: Partial<LLMProvider>): Promise<LLMProvider> => {
    const { data } = await api.patch(`/llm-providers/${id}/`, provider);
    return data;
  },

  deleteProvider: async (id: string): Promise<void> => {
    await api.delete(`/llm-providers/${id}/`);
  },
};

export interface YouTubeChatSession {
  id: string;
  video_id: string;
  character: string;
  character_name: string;
  status: 'active' | 'paused' | 'stopped';
  auto_reply: boolean;
  messages_received: number;
  replies_sent: number;
  started_at: string;
  stopped_at: string | null;
}

export interface YouTubeChatMessage {
  id: string;
  author_name: string;
  author_channel_id: string;
  text: string;
  is_mod: boolean;
  is_owner: boolean;
  is_super_chat: boolean;
  ai_response: string;
  ai_responded: boolean;
  received_at: string;
}

export const youtubeChatApi = {
  startSession: async (
    videoId: string,
    characterId?: string,
    autoReply: boolean = false
  ): Promise<YouTubeChatSession> => {
    const { data } = await api.post('/yt-chat/start/', {
      video_id: videoId,
      character_id: characterId || null,
      auto_reply: autoReply,
    });
    return data;
  },

  stopSession: async (): Promise<{ status: string }> => {
    const { data } = await api.post('/yt-chat/stop/');
    return data;
  },

  getStatus: async (): Promise<YouTubeChatSession | { active: false }> => {
    const { data } = await api.get('/yt-chat/status/');
    return data;
  },

  getMessages: async (sessionId: string): Promise<{ results: YouTubeChatMessage[] }> => {
    const { data } = await api.get(`/yt-messages/?session_id=${sessionId}`);
    return data;
  },

  getSessions: async (): Promise<{ results: YouTubeChatSession[] }> => {
    const { data } = await api.get('/yt-sessions/');
    return data;
  },
};

// TTS API
export const ttsApi = {
  generate: async (text: string, voice?: string, rate?: string): Promise<Blob> => {
    const { data } = await api.post('/tts/generate/', {
      text,
      voice,
      rate,
    }, {
      responseType: 'blob',
    });
    return data;
  },

  getVoices: async (language?: string): Promise<{
    voices: Record<string, Array<{ id: string; name: string; gender: string }>>;
    default_voice: string;
  }> => {
    const { data } = await api.get('/tts/voices/', {
      params: language ? { language } : {},
    });
    return data;
  },

  chatMessage: async (
    text: string,
    characterId?: string,
    voice?: string,
    rate?: string
  ): Promise<Blob> => {
    const { data } = await api.post('/tts/chat-message/', {
      text,
      character_id: characterId,
      voice,
      rate,
    }, {
      responseType: 'blob',
    });
    return data;
  },
};

export default api;
