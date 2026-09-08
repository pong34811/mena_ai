/**
 * Tests for CharactersPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CharactersPage from '../CharactersPage';
import { characterApi } from '@/services/api';

// Mock API
vi.mock('@/services/api', () => ({
  characterApi: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    generatePrompt: vi.fn(),
  },
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

describe('CharactersPage', () => {
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
      response_language: 'english',
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
    (characterApi.getAll as any).mockResolvedValue(mockCharacters);
  });

  const renderCharactersPage = (path = '/characters') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/characters" element={<CharactersPage />} />
          <Route path="/characters/new" element={<CharactersPage />} />
          <Route path="/characters/edit/:id" element={<CharactersPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('loads and displays characters', async () => {
    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });
    expect(screen.getByText('ไค')).toBeInTheDocument();
  });

  it('shows "Add Character" button', async () => {
    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('Add Character')).toBeInTheDocument();
    });
  });

  it('opens the create form when navigating to /characters/new', async () => {
    renderCharactersPage('/characters/new');

    await waitFor(() => {
      expect(screen.getByText('New Character')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Character name')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('displays character details', async () => {
    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    expect(screen.getByText('Friendly VTuber')).toBeInTheDocument();
    expect(screen.getByText(/3d memory/)).toBeInTheDocument();
  });

  it('shows edit and delete buttons for each character', async () => {
    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    expect(screen.getAllByTestId('icon-Pencil')).toHaveLength(2);
    expect(screen.getAllByTestId('icon-Trash2')).toHaveLength(2);
    expect(screen.getAllByTestId('icon-Sparkles').length).toBeGreaterThanOrEqual(2);
  });

  it('handles delete confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    (characterApi.delete as any).mockResolvedValue(undefined);

    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTestId('icon-Trash2');
    fireEvent.click(deleteButtons[0].closest('button')!);

    expect(window.confirm).toHaveBeenCalledWith(
      'Are you sure you want to delete this character?'
    );
    await waitFor(() => {
      expect(characterApi.delete).toHaveBeenCalledWith('char-1');
    });

    vi.unstubAllGlobals();
  });

  it('skips delete when confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByTestId('icon-Trash2');
    fireEvent.click(deleteButtons[0].closest('button')!);

    expect(characterApi.delete).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('submits form to create character', async () => {
    (characterApi.create as any).mockResolvedValue({ id: 'new-char' });

    renderCharactersPage('/characters/new');

    await waitFor(() => {
      expect(screen.getByText('New Character')).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText('Character name');
    fireEvent.change(nameInput, { target: { value: 'New Char' } });

    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(characterApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Char' })
      );
    });
  });

  it('shows AI generate prompt modal and saves', async () => {
    (characterApi.generatePrompt as any).mockResolvedValue({
      system_prompt_ai: 'Generated prompt',
      messages_analyzed: 5,
      total_messages: 10,
    });
    (characterApi.update as any).mockResolvedValue({});

    renderCharactersPage();

    await waitFor(() => {
      expect(screen.getByText('มีนา')).toBeInTheDocument();
    });

    // The first Sparkles icon is in the nav <a>; pick one inside a <button>
    // (the per-card "Generate AI Prompt" button).
    const sparkleButton = screen
      .getAllByTestId('icon-Sparkles')
      .map((svg) => svg.closest('button'))
      .find((btn) => btn !== null);
    expect(sparkleButton).toBeTruthy();
    act(() => {
      fireEvent.click(sparkleButton!);
    });

    await waitFor(() => {
      expect(screen.getByText('Generate AI Prompt')).toBeInTheDocument();
    });
    expect(screen.getByText(/5\/10 messages/)).toBeInTheDocument();

    const saveButton = screen.getByText('Save Prompt');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(characterApi.update).toHaveBeenCalledWith('char-1', {
        system_prompt_ai: 'Generated prompt',
      });
    });
  });

  it('loads character for editing via /characters/edit/:id', async () => {
    (characterApi.getById as any).mockResolvedValue({
      ...mockCharacters[0],
      system_prompt_ai: 'Existing AI prompt',
    });

    renderCharactersPage('/characters/edit/char-1');

    await waitFor(() => {
      expect(characterApi.getById).toHaveBeenCalledWith('char-1');
    });
    expect(screen.getByText('Edit Character')).toBeInTheDocument();
  });
});
