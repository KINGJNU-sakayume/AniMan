import { test, expect } from '@playwright/test';

/**
 * Main application E2E tests.
 * These tests require an approved test account. Set environment variables:
 *   E2E_USERNAME — approved test user username
 *   E2E_PASSWORD — approved test user password
 *
 * Tests cover: login, main view, header navigation, timeline interaction,
 * progress tracking, social card, and admin dashboard access.
 */

const TEST_USERNAME = process.env.E2E_USERNAME ?? '';
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? '';

test.describe('Main App (requires approved account)', () => {
  test.skip(!TEST_USERNAME || !TEST_PASSWORD, 'E2E_USERNAME / E2E_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('아이디').fill(TEST_USERNAME);
    await page.getByPlaceholder('패스워드').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 15000 });
  });

  test('renders header after login', async ({ page }) => {
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByText('AniMan')).toBeVisible();
  });

  test('shows series selector in header', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible();
    const options = await select.locator('option').count();
    expect(options).toBeGreaterThan(0);
  });

  test('search bar filters series list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/검색/);
    await expect(searchInput).toBeVisible();
    await searchInput.fill('nonexistent_series_xyz');
    const select = page.locator('select');
    const options = await select.locator('option').count();
    expect(options).toBeLessThanOrEqual(1);
  });

  test('renders hero section with progress bars', async ({ page }) => {
    await page.waitForTimeout(1000);
    const progressBars = page.getByRole('progressbar');
    await expect(progressBars.first()).toBeVisible({ timeout: 10000 });
  });

  test('renders timeline tracker section', async ({ page }) => {
    await expect(page.getByText('My Progress Tracker')).toBeVisible({ timeout: 10000 });
  });

  test('can open and close social card', async ({ page }) => {
    await page.getByRole('button', { name: 'Share Progress' }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('AniMan Journey')).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('can toggle episode completion in timeline', async ({ page }) => {
    await page.waitForTimeout(1500);
    const timelineRegion = page.getByRole('region', { name: '타임라인 스크롤 영역' });
    const firstNode = timelineRegion.getByRole('button').first();
    if (await firstNode.isVisible()) {
      const initialState = await firstNode.getAttribute('aria-pressed');
      await firstNode.click();
      await expect(firstNode).toHaveAttribute(
        'aria-pressed',
        initialState === 'true' ? 'false' : 'true'
      );
    }
  });

  test('logout button is visible and functional', async ({ page }) => {
    const logoutBtn = page.getByTitle('로그아웃');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    await expect(page.getByPlaceholder('아이디')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Admin Dashboard (requires approved account)', () => {
  test.skip(!TEST_USERNAME || !TEST_PASSWORD, 'E2E_USERNAME / E2E_PASSWORD not set');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('아이디').fill(TEST_USERNAME);
    await page.getByPlaceholder('패스워드').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByRole('banner')).toBeVisible({ timeout: 15000 });
  });

  test('navigates to admin password screen', async ({ page }) => {
    await page.getByTitle('Admin Dashboard').click();
    await expect(page.getByText('Admin 인증')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('shows error for wrong admin password', async ({ page }) => {
    await page.getByTitle('Admin Dashboard').click();
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('패스워드가 올바르지 않습니다.')).toBeVisible();
  });

  test('back button returns to main view from admin screen', async ({ page }) => {
    await page.getByTitle('Admin Dashboard').click();
    await expect(page.getByText('Admin 인증')).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: '돌아가기' }).click();
    await expect(page.getByText('My Progress Tracker')).toBeVisible({ timeout: 5000 });
  });
});
