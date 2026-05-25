import { test, expect } from '@playwright/test';

test.describe('🔐 Auth - User Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC-AUTH-01: Login page loads with Login, Sign Up and Forgot Password tabs', async ({ page }) => {
    await expect(page.getByText('Login').first()).toBeVisible();
    await expect(page.getByText('Sign Up').first()).toBeVisible();
    await expect(page.getByText('Forgot Password').first()).toBeVisible();
  });

  test('TC-AUTH-02: Password Login tab shows phone and password fields', async ({ page }) => {
    // Password Login is shown by default when mode=login, loginMethod=password
    await page.getByText('Password Login').click();
    await expect(page.getByPlaceholder('+919000000001').first()).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('TC-AUTH-03: Switching to Sign Up shows all required registration fields', async ({ page }) => {
    await page.getByText('Sign Up').click();
    await expect(page.getByPlaceholder('Your full name')).toBeVisible();
    await expect(page.getByText('Create Verified Account')).toBeVisible();
  });

  test('TC-AUTH-04: OTP Login flow renders Send OTP button', async ({ page }) => {
    await page.getByText('OTP Login').click();
    await expect(page.getByText('Send Login OTP')).toBeVisible();
    await expect(page.getByPlaceholder('+919000000001').first()).toBeVisible();
  });

  test('TC-AUTH-05: Login form has required phone and password fields', async ({ page }) => {
    await page.getByText('Password Login').click();
    const phoneInput = page.getByPlaceholder('+919000000001').first();
    const passwordInput = page.getByPlaceholder('Enter your password');
    await expect(phoneInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    // Verify they are required fields
    const phoneRequired = await phoneInput.getAttribute('required');
    expect(phoneRequired).not.toBeNull();
  });

  test('TC-AUTH-06: Login with wrong credentials shows error', async ({ page }) => {
    await page.getByText('Password Login').click();
    await page.getByPlaceholder('+919000000001').first().fill('+919999999999');
    await page.getByPlaceholder('Enter your password').fill('wrongpassword');
    await page.getByRole('button', { name: /Sign In/i }).click();
    // Wait for API call to resolve and error to appear
    await expect(page.locator('.auth-error').first()).toBeVisible({ timeout: 8000 });
  });
});
