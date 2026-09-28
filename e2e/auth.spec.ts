import { test, expect } from '@playwright/test';
import { mockSupabase } from './support/mockSupabase';

test.describe('인증', () => {
  test.beforeEach(async ({ page }) => {
    await mockSupabase(page);
    await page.goto('./');
  });

  test('처음 접속하면 로그인 화면', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AniMan' })).toBeVisible();
    await expect(page.getByPlaceholder('아이디')).toBeVisible();
    await expect(page.getByPlaceholder('패스워드', { exact: true })).toBeVisible();
  });

  test('빈 폼 제출 시 안내', async ({ page }) => {
    await page.getByRole('button', { name: '로그인', exact: true }).last().click();
    await expect(page.getByRole('alert')).toHaveText('아이디와 패스워드를 입력해주세요.');
  });

  test('아이디에 @ 사용 불가', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('user@test');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('password123');
    await page.getByPlaceholder('패스워드', { exact: true }).press('Enter');
    await expect(page.getByRole('alert')).toHaveText('아이디에 @나 공백은 사용할 수 없습니다.');
  });

  test('회원가입: 패스워드 불일치 / 길이', async ({ page }) => {
    await page.getByRole('tab', { name: '회원가입' }).click();
    await page.getByPlaceholder('아이디').fill('newbie');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('password123');
    await page.getByPlaceholder('패스워드 확인').fill('different');
    await page.getByRole('button', { name: '가입 신청' }).click();
    await expect(page.getByRole('alert')).toHaveText('패스워드가 일치하지 않습니다.');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('123');
    await page.getByPlaceholder('패스워드 확인').fill('123');
    await page.getByRole('button', { name: '가입 신청' }).click();
    await expect(page.getByRole('alert')).toHaveText('패스워드는 6자 이상이어야 합니다.');
  });

  test('잘못된 자격 증명', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('tester');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('wrong-password');
    await page.getByPlaceholder('패스워드', { exact: true }).press('Enter');
    await expect(page.getByRole('alert')).toHaveText('아이디 또는 패스워드가 올바르지 않습니다.');
  });

  test('가입하면 승인 대기 화면', async ({ page }) => {
    await page.getByRole('tab', { name: '회원가입' }).click();
    await page.getByPlaceholder('아이디').fill('newbie');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('password123');
    await page.getByPlaceholder('패스워드 확인').fill('password123');
    await page.getByRole('button', { name: '가입 신청' }).click();
    await expect(page.getByRole('heading', { name: '승인 대기 중' })).toBeVisible();
    await page.getByRole('button', { name: '다른 계정으로 로그인' }).click();
    await expect(page.getByPlaceholder('아이디')).toBeVisible();
  });

  test('승인된 사용자는 로그인 후 작품 목록', async ({ page }) => {
    await page.getByPlaceholder('아이디').fill('tester');
    await page.getByPlaceholder('패스워드', { exact: true }).fill('password123');
    await page.getByPlaceholder('패스워드', { exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: '내 작품 목록' })).toBeVisible();
  });
});
