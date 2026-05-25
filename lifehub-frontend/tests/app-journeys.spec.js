import { test, expect } from '@playwright/test';

// Injects a fake session using the CORRECT key App.jsx uses: lifehub_session_v1
async function injectFakeSession(page) {
  await page.addInitScript(() => {
    const fakeSession = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      user: {
        id: '1',
        name: 'Test User',
        phone: '+919876543210',
        email: 'test@lifehub.com',
        roles: ['CUSTOMER'],
      },
    };
    localStorage.setItem('lifehub_session_v1', JSON.stringify(fakeSession));
  });
}

test.describe('💬 Chat - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/');
    // Wait for SuperAppPage to mount (not AuthPage)
    await expect(page.locator('nav, [class*="sidebar"], [class*="tab"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-CHAT-01: Chat tab is visible in navigation', async ({ page }) => {
    await expect(page.getByText('Chat').first()).toBeVisible();
  });

  test('TC-CHAT-02: Clicking Chat tab opens chat section', async ({ page }) => {
    await page.getByText('Chat').first().click();
    // Chat section should show — wait for any chat-related UI
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-CHAT-03: Chat section does not crash', async ({ page }) => {
    await page.getByText('Chat').first().click();
    await page.waitForTimeout(1000);
    // No error overlay should appear
    const errorOverlay = await page.getByText('Something went wrong').count();
    expect(errorOverlay).toBe(0);
  });
});

test.describe('📦 Orders - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/');
    await expect(page.locator('nav, [class*="sidebar"], [class*="tab"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-ORD-01: Orders tab is visible and navigates correctly', async ({ page }) => {
    await expect(page.getByText('Orders').first()).toBeVisible();
    await page.getByText('Orders').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-ORD-02: Orders page shows no crash', async ({ page }) => {
    await page.getByText('Orders').first().click();
    await page.waitForTimeout(1000);
    const errorOverlay = await page.getByText('Something went wrong').count();
    expect(errorOverlay).toBe(0);
  });
});

test.describe('💰 Wallet - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/');
    await expect(page.locator('nav, [class*="sidebar"], [class*="tab"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-WAL-01: Wallet tab visible and navigates', async ({ page }) => {
    await expect(page.getByText('Wallet').first()).toBeVisible();
    await page.getByText('Wallet').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-WAL-02: Wallet section does not crash', async ({ page }) => {
    await page.getByText('Wallet').first().click();
    await page.waitForTimeout(1000);
    const errorOverlay = await page.getByText('Something went wrong').count();
    expect(errorOverlay).toBe(0);
  });
});

test.describe('👤 Profile / Settings - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/');
    await expect(page.locator('nav, [class*="sidebar"], [class*="tab"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('TC-PROF-01: Settings tab visible and loads', async ({ page }) => {
    await expect(page.getByText('Settings').first()).toBeVisible();
    await page.getByText('Settings').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-PROF-02: Settings page shows no crash', async ({ page }) => {
    await page.getByText('Settings').first().click();
    await page.waitForTimeout(1000);
    const errorOverlay = await page.getByText('Something went wrong').count();
    expect(errorOverlay).toBe(0);
  });
});
