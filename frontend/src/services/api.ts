// API service for communicating with Django backend

import axios from 'axios';
import type { Character, ChatMessage, ChatRequest, ChatResponse, HealthResponse, LLMProvider, LLMStatus } from '../types';

const api = axios.create({
  baseURL: 'http://127.0.0.1:8000/api',
  headers: {
    'Content-Type': 'application/json',
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

export default api;
