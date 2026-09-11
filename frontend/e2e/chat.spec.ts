import { test, expect, type Page } from '@playwright/test';

const CHARACTERS = [
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

const AI_REPLY = 'สวัสดีครับ!';

async function mockBackend(page: Page) {
  let ttsEnabled = false;

  await page.route('**/api/characters/', (route) => route.fulfill({ json: CHARACTERS }));

  await page.route('**/api/chat/', (route) =>
    route.fulfill({
      json: { response: AI_REPLY, character_id: 'char-1', message_id: 'msg-1' },
    })
  );

  await page.route('**/api/output-devices/current/', (route) =>
    route.fulfill({ json: { device: { device_id: '' } } })
  );

  await page.route('**/api/yt-chat/status/', (route) =>
    route.fulfill({ json: { active: false } })
  );

  await page.route('**/api/tts/settings/', (route) =>
    route.fulfill({
      json: {
        questioner_enabled: ttsEnabled,
        questioner_voice: 'th_TH-tsync2-medium',
        questioner_rate: '+0%',
        questioner_say_username: true,
        responder_enabled: ttsEnabled,
        responder_voice: 'th_TH-tsync2-medium',
        responder_rate: '+0%',
        responder_delay_ms: 1000,
        output_device_id: '',
      },
    })
  );

  await page.route('**/api/tts/settings/update/', (route) => {
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    if (typeof body.questioner_enabled === 'boolean') ttsEnabled = body.questioner_enabled;
    if (typeof body.responder_enabled === 'boolean') ttsEnabled = body.responder_enabled;
    return route.fulfill({ json: {} });
  });
}

test.describe('Chat Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test('loads the home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'MENA AI VTuber' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  });

  test('navigates to the chat page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Chatting' }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByText('Characters', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('lists characters in the chat sidebar', async ({ page }) => {
    await page.goto('/chat');
    const sidebar = page.locator('aside');
    await expect(sidebar.getByRole('button', { name: /มีนา/ })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: /ไค/ })).toBeVisible();
  });

  test('selects the first character by default and switches on click', async ({ page }) => {
    await page.goto('/chat');
    const sidebar = page.locator('aside');
    const mena = sidebar.getByRole('button', { name: /มีนา/ });
    const kai = sidebar.getByRole('button', { name: /ไค/ });

    await expect(mena).toHaveClass(/bg-primary\/20/);
    await kai.click();
    await expect(kai).toHaveClass(/bg-primary\/20/);
  });

  test('sends a message and renders the reply', async ({ page }) => {
    await page.goto('/chat');

    const input = page.getByPlaceholder(/Message มีนา/);
    await expect(input).toBeVisible();
    await input.fill('สวัสดี');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByText('สวัสดี', { exact: true })).toBeVisible();
    await expect(page.getByText(AI_REPLY, { exact: true })).toBeVisible();
  });

  test('toggles TTS', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.getByRole('button', { name: /TTS Off/ })).toBeVisible();
    await page.getByRole('button', { name: /TTS Off/ }).click();
    await expect(page.getByRole('button', { name: /TTS On/ })).toBeVisible();
  });

  test('shows the output device selector in the chat header', async ({ page }) => {
    await page.goto('/chat');
    // The selector container should be visible (it shows unsupported badge or the select)
    const selector = page.getByTestId('output-device-selector');
    const unsupported = page.getByTestId('output-device-unsupported');
    // Either the selector or the unsupported badge should exist
    await expect(selector.or(unsupported)).toBeVisible({ timeout: 10000 });
  });

  test('shows the YouTube panel when toggled', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('button', { name: /YouTube Live Chat/ }).click();
    await expect(page.getByPlaceholder('YouTube URL or Video ID')).toBeVisible();
  });
});
