// LLM Provider Settings component

import { useState, useEffect } from 'react';
import { healthApi, llmStatusApi } from '../services/api';
import type { LLMProvider } from '../types';

function LLMSettings() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    api_url: '',
    api_key: '',
    model_name: '',
    temperature: 0.7,
    max_tokens: 2048,
    is_active: true,
  });

  useEffect(() => {
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const data = await llmStatusApi.getProviders();
      setProviders(data);
      if (data.length > 0) {
        setSelectedProvider(data[0]);
        setFormData({
          name: data[0].name || '',
          api_url: data[0].api_url || '',
          api_key: data[0].api_key || '',
          model_name: data[0].model_name || '',
          temperature: data[0].temperature || 0.7,
          max_tokens: data[0].max_tokens || 2048,
          is_active: data[0].is_active !== false,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load providers' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedProvider) return;

    try {
      setSaving(true);
      await llmStatusApi.updateProvider(selectedProvider.id, formData);
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      loadProviders();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setMessage({ type: 'success', text: 'Testing connection...' });
      const result = await healthApi.check();
      if (result.llm_api === 'connected') {
        setMessage({ type: 'success', text: `Connected! ${result.models_available} models available` });
      } else {
        setMessage({ type: 'error', text: 'LLM API not connected' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection test failed' });
    }
  };

  const handleAddProvider = async () => {
    try {
      setSaving(true);
      await llmStatusApi.createProvider({
        name: 'New Provider',
        api_url: 'http://127.0.0.1:31415/v1/chat/completions',
        api_key: '',
        model_name: 'auto',
        temperature: 0.7,
        max_tokens: 2048,
        is_active: true,
      });
      setMessage({ type: 'success', text: 'Provider added!' });
      loadProviders();
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to add provider' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="loading">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>LLM Provider Settings</h2>
        <div className="header-actions">
          <button onClick={handleTestConnection} className="btn-secondary">
            Test Connection
          </button>
          <button onClick={handleAddProvider} className="btn-secondary">
            + Add Provider
          </button>
        </div>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-content">
        <div className="providers-list">
          <h3>Providers</h3>
          {providers.length === 0 ? (
            <div className="empty">No providers configured</div>
          ) : (
            providers.map((provider) => (
              <div
                key={provider.id}
                className={`provider-item ${selectedProvider?.id === provider.id ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedProvider(provider);
                  setFormData({
                    name: provider.name || '',
                    api_url: provider.api_url || '',
                    api_key: provider.api_key || '',
                    model_name: provider.model_name || '',
                    temperature: provider.temperature || 0.7,
                    max_tokens: provider.max_tokens || 2048,
                    is_active: provider.is_active !== false,
                  });
                }}
              >
                <span className="provider-name">{provider.name}</span>
                <span className={`provider-status ${provider.is_active ? 'active' : 'inactive'}`}>
                  {provider.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
          )}
        </div>

        {selectedProvider && (
          <div className="settings-form">
            <h3>Configuration</h3>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Provider name"
              />
            </div>

            <div className="form-group">
              <label>API URL</label>
              <input
                type="text"
                value={formData.api_url}
                onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                placeholder="http://127.0.0.1:31415/v1/chat/completions"
              />
            </div>

            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Enter API key"
              />
            </div>

            <div className="form-group">
              <label>Model Name</label>
              <input
                type="text"
                value={formData.model_name}
                onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                placeholder="auto"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Temperature ({formData.temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label>Max Tokens</label>
                <input
                  type="number"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                  min="100"
                  max="10000"
                />
              </div>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default LLMSettings;
