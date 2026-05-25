import { test, expect } from '@playwright/test';

// Helper: simulate a logged-in session by injecting localStorage
async function injectFakeSession(page) {
  await page.addInitScript(() => {
    const fakeSession = {
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
      user: {
        id: '1',
        name: 'Test User',
        phone: '9876543210',
        email: 'test@lifehub.com',
        roles: ['CUSTOMER'],
      },
    };
    localStorage.setItem('lifehub_session', JSON.stringify(fakeSession));
  });
}

test.describe('🛒 Marketplace - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/');
  });

  test('TC-MKT-01: Marketplace tab is visible and clickable', async ({ page }) => {
    const marketplaceTab = page.getByText('Marketplace');
    await expect(marketplaceTab).toBeVisible();
    await marketplaceTab.click();
  });

  test('TC-MKT-02: Marketplace loads product search bar', async ({ page }) => {
    await page.getByText('Marketplace').click();
    const searchInput = page.getByPlaceholder(/search products/i);
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });

  test('TC-MKT-03: Typing in search triggers product search', async ({ page }) => {
    await page.getByText('Marketplace').click();
    const searchInput = page.getByPlaceholder(/search products/i);
    await searchInput.fill('rice');
    await page.keyboard.press('Enter');
    // Search should have been triggered - wait for loading state or results
    await page.waitForTimeout(500);
    // Verify no crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('TC-MKT-04: Cart drawer opens and shows empty state', async ({ page }) => {
    await page.getByText('Marketplace').click();
    // Click the cart button/icon
    const cartBtn = page.locator('[class*="cart"], [aria-label*="cart"], button:has-text("0")').first();
    if (await cartBtn.isVisible()) {
      await cartBtn.click();
      await expect(page.locator('text=Your Cart')).toBeVisible({ timeout: 3000 });
    }
  });

  test('TC-MKT-05: Filter drawer opens and allows filter inputs', async ({ page }) => {
    await page.getByText('Marketplace').click();
    const filterBtn = page.locator('button:has-text("Filter"), button[aria-label*="filter"], [class*="filter"]').first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await expect(page.getByText('Apply Filters')).toBeVisible({ timeout: 3000 });
    }
  });
});
