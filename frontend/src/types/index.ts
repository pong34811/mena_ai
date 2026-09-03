// Types for AI VTuber system

export interface Character {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  avatar_url: string;
  response_language: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  character: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface ChatRequest {
  character_id: string;
  message: string;
  stream?: boolean;
}

export interface ChatResponse {
  response: string;
  character_id: string;
  message_id: string;
}

export interface HealthResponse {
  status: string;
  llm_api: 'connected' | 'disconnected';
  models_available?: number;
  models?: string[];
  selected_model?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  api_url: string;
  api_key: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LLMStatus {
  api_url: string;
  configured_model: string;
  working_model: string | null;
  auto_model: string;
  cached_models_count: number;
  available_models_count: number;
  available_models_preview: string[];
  rate_limit?: {
    max_requests: number;
    window_seconds: number;
    current_requests: number;
    wait_time: number;
  };
}
