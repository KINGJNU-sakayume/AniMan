import { test, expect } from '@playwright/test';

/**
 * Authentication flow E2E tests.
 * Covers login modal display, form validation, registration, and pending approval screen.
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows login modal on initial load', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AniMan' })).toBeVisible();
    await expect(page.getByPlaceholder('아이디')).toBeVisible();
    await expect(page.getByPlaceholder('패스워드')).toBeVisible();
  });

  test('shows validation error when submitting empty form', async ({ page }) => {
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('아이디와 패스워드를 입력해주세요.')).toBeVisible();
  });

  test('shows validation error for username with @ symbol', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('user@test');
    await page.getByPlaceholder('패스워드').fill('password123');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('아이디에 @나 공백은 사용할 수 없습니다.')).toBeVisible();
  });

  test('switches to register tab', async ({ page }) => {
    await page.getByRole('button', { name: '회원가입' }).click();
    await expect(page.getByPlaceholder('패스워드 확인')).toBeVisible();
    await expect(page.getByRole('button', { name: '가입 신청' })).toBeVisible();
  });

  test('shows password mismatch error on register', async ({ page }) => {
    await page.getByRole('button', { name: '회원가입' }).click();
    await page.getByPlaceholder('아이디').fill('testuser');
    await page.getByPlaceholder('패스워드').fill('password123');
    await page.getByPlaceholder('패스워드 확인').fill('different123');
    await page.getByRole('button', { name: '가입 신청' }).click();
    await expect(page.getByText('패스워드가 일치하지 않습니다.')).toBeVisible();
  });

  test('shows password length error on register', async ({ page }) => {
    await page.getByRole('button', { name: '회원가입' }).click();
    await page.getByPlaceholder('아이디').fill('testuser');
    await page.getByPlaceholder('패스워드').fill('123');
    await page.getByPlaceholder('패스워드 확인').fill('123');
    await page.getByRole('button', { name: '가입 신청' }).click();
    await expect(page.getByText('패스워드는 6자 이상이어야 합니다.')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('nonexistent_user_xyz');
    await page.getByPlaceholder('패스워드').fill('wrongpassword');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(
      page.getByText('아이디 또는 패스워드가 올바르지 않습니다.')
    ).toBeVisible({ timeout: 10000 });
  });

  test('can submit form with Enter key', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('testuser');
    await page.getByPlaceholder('패스워드').fill('password123');
    await page.getByPlaceholder('패스워드').press('Enter');
    await expect(
      page.getByText('아이디 또는 패스워드가 올바르지 않습니다.')
    ).toBeVisible({ timeout: 10000 });
  });
});
