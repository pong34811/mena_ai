import { test, expect } from '@playwright/test';

test.describe('Chat Flow E2E', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('MENA AI VTuber')).toBeVisible();
    await expect(page.getByText('Start Chatting')).toBeVisible();
  });

  test('should navigate to chat page', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start Chatting').click();
    await expect(page).toHaveURL('/chat');
    await expect(page.getByText('Characters')).toBeVisible();
  });

  test('should display characters in chat sidebar', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('Characters')).toBeVisible();
    // Wait for characters to load
    await expect(page.locator('[class*="bg-primary/20"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should send a message and receive reply', async ({ page }) => {
    await page.goto('/chat');

    // Wait for character to load
    await expect(page.locator('[class*="bg-primary/20"]').first()).toBeVisible({ timeout: 10000 });

    // Type a message
    const input = page.getByPlaceholder(/Message/);
    await input.fill('สวัสดี');

    // Click send button
    const sendButton = page.getByRole('button', { name: /send/i });
    await sendButton.click();

    // Wait for AI reply (may take time)
    await expect(page.locator('[role="assistant"]').first()).toBeVisible({ timeout: 60000 });
  });

  test('should toggle TTS', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.getByText('TTS On')).toBeVisible();
    await page.getByText('TTS On').click();
    await expect(page.getByText('TTS Off')).toBeVisible();
  });

  test('should show YouTube panel when toggled', async ({ page }) => {
    await page.goto('/chat');
    await page.getByText('YouTube Live Chat').click();
    await expect(page.getByPlaceholder('YouTube URL or Video ID')).toBeVisible();
  });
});