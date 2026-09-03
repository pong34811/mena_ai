// Chat component

import { useState, useRef, useEffect } from 'react';
import { chatApi } from '../services/api';
import type { Character } from '../types';

interface Props {
  character: Character;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function Chat({ character }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: DisplayMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await chatApi.sendMessage({
        character_id: character.id,
        message: userMessage.content,
      });

      const assistantMessage: DisplayMessage = {
        id: response.message_id,
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <div className="chat-character">
          <div className="avatar-placeholder small">{character.name[0]}</div>
          <div>
            <h3>{character.name}</h3>
            <span className="character-status">Active</span>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Start a conversation with {character.name}!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? 'U' : character.name[0]}
              </div>
              <div className="message-content">
                <div className="message-text">{msg.content}</div>
                <div className="message-time">
                  {msg.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="message assistant loading-message">
            <div className="message-avatar">{character.name[0]}</div>
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={`Message ${character.name}...`}
          rows={1}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          {loading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default Chat;
