import type { Page } from '@playwright/test';
import { test, expect, openSettings } from './fixtures';
import { createFakeSyncServer } from '../src/test/fakeSyncServer';

// 설정 시트와 Life Hub 공통 규격. Life Hub API 는 가짜(빈 인박스, 동기화 문서 없음)이고 데이터는 전부 합성이다.
const HUB = 'https://life-hub-api.213303.workers.dev';
const TOKENS = 'animan.lifehub.tokens.v1';
const SYNC_STATE = 'animan.sync.state.v1';

async function fakeHub(page: Page) {
  const server = createFakeSyncServer();
  await page.route(HUB + '/**', async (route) => {
    const req = route.request();
    const cors = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': 'Authorization, *',
      'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After', 'Content-Type': 'application/json',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname.startsWith('/animan/v1') ? url.pathname.slice('/animan/v1'.length) : url.pathname;
    if (path === '/sync' || path.startsWith('/sync/')) {
      const res = await server.handle({ method: req.method(), path, headers: req.headers(), body: req.postData() ?? undefined });
      return route.fulfill({ status: res.status, headers: { ...res.headers, ...cors }, body: res.body });
    }
    return route.fulfill({ status: 200, headers: cors, body: req.method() === 'GET' ? JSON.stringify({ candidates: [] }) : '{}' });
  });
}

const connectAs = (page: Page, scope: string, syncState?: Record<string, unknown>) =>
  page.addInitScript(({ key, stateKey, grant, state }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: Date.now() + 3_600_000, scope: grant }));
    if (state) localStorage.setItem(stateKey, JSON.stringify(state));
  }, { key: TOKENS, stateKey: SYNC_STATE, grant: scope, state: syncState ?? null });

test('the gear opens 설정 with Life Hub → 백업 → 카탈로그 관리, and 카탈로그 관리 goes to the admin screen', async ({ page }) => {
  await page.goto('./');
  // 백업 버튼은 더 이상 목록 상단 바에 없다
  await expect(page.getByTitle('진행 기록 백업 내보내기')).toHaveCount(0);
  const sheet = await openSettings(page);
  const headings = await sheet.getByRole('heading').allTextContents();
  expect(headings).toEqual(['설정', 'Life Hub', '백업']);
  await expect(sheet.getByTitle('진행 기록 백업 내보내기')).toBeVisible();
  await sheet.getByRole('button', { name: '카탈로그 관리' }).click();
  await expect(page.getByRole('dialog', { name: '설정' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
});

test('(1) no proposals: the Claude proposal entry point is not rendered at all', async ({ page }) => {
  await fakeHub(page);
  await connectAs(page, 'animan:inbox animan:sync');
  await page.goto('./');
  await expect(page.getByText('내 작품 목록')).toBeVisible();
  const sheet = await openSettings(page);
  await expect(sheet.getByTestId('sync-status')).toHaveAttribute('data-phase', 'idle');
  await sheet.getByRole('button', { name: '닫기' }).click();
  await expect(page.getByTitle('Claude가 제안한 진행 기록')).toHaveCount(0);
  await expect(page.getByTestId('lifehub-count')).toHaveCount(0);
  await expect(page.getByText(/Life Hub에 연결하면/)).toHaveCount(0);
});

test('(2) 확인 필요: the gear carries the dot and " (확인 필요)" in its name; A/B have neither', async ({ page }) => {
  await fakeHub(page);
  await connectAs(page, 'animan:inbox'); // no sync scope → C
  await page.goto('./');
  const gear = page.getByRole('button', { name: '설정 (확인 필요)' });
  await expect(gear).toBeVisible();
  await expect(gear.getByTestId('settings-attention')).toBeVisible();
  // 시리즈 화면의 톱니도 같다
  await page.getByText('E2E 테스트 작품').first().click();
  await expect(page.getByRole('banner').getByRole('button', { name: '설정 (확인 필요)' })).toBeVisible();
});

test('(2b) not connected (A): no dot, plain name', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: '설정', exact: true })).toBeVisible();
  await expect(page.getByTestId('settings-attention')).toHaveCount(0);
});

test('(3) before connecting, 「Life Hub 연결」 exists only in 설정 › Life Hub', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('내 작품 목록')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Life Hub 연결' })).toHaveCount(0);
  const sheet = await openSettings(page);
  await expect(page.getByRole('button', { name: 'Life Hub 연결' })).toHaveCount(1);
  const section = sheet.getByTestId('lifehub-settings');
  await expect(section.getByText('Claude가 제안한 기록을 받고, 이 앱의 기록을 다른 기기와 맞춥니다.')).toBeVisible();
  // 개발 서버는 배포 주소가 아니라 연결할 수 없다
  await expect(section.getByRole('button', { name: 'Life Hub 연결' })).toBeDisabled();
  await expect(section.getByText('배포된 주소에서만 연결할 수 있어요.')).toBeVisible();
});

test('(4) there is no sync on/off control anywhere in 설정', async ({ page }) => {
  await fakeHub(page);
  await connectAs(page, 'animan:inbox animan:sync');
  await page.goto('./');
  const sheet = await openSettings(page);
  await expect(sheet.getByTestId('sync-status')).toHaveAttribute('data-phase', 'idle');
  await expect(sheet.getByText(/동기화 (켜기|끄기)/)).toHaveCount(0);
  await expect(sheet.getByRole('switch')).toHaveCount(0);
  // 체크박스는 자동 반영 하나뿐이다
  await expect(sheet.getByRole('checkbox')).toHaveCount(1);
  await expect(sheet.getByRole('checkbox', { name: /Claude에서 승인한 기록은 바로 반영/ })).toBeVisible();
  await expect(sheet.getByText(/클라우드/)).toHaveCount(0);
});

test('(5) connected with the sync scope: a stored "off" is switched on at start', async ({ page }) => {
  await fakeHub(page);
  await connectAs(page, 'animan:inbox animan:sync', { enabled: false, version: null, syncedHash: null, lastSyncAt: null, deviceLabel: null, halt: null });
  await page.goto('./');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').enabled, SYNC_STATE)).toBe(true);
  const sheet = await openSettings(page);
  await expect(sheet.getByTestId('sync-status')).toHaveAttribute('data-phase', 'idle');
  await expect(sheet.getByTestId('sync-status')).toContainText(/^연결됨 · /);
  await expect(sheet.getByRole('button', { name: '지금 동기화' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: '연결 해제' })).toBeVisible();
});

test('연결 해제 stops proposals and sync and keeps this device\'s records', async ({ page }) => {
  await fakeHub(page);
  await connectAs(page, 'animan:inbox animan:sync');
  await page.goto('./');
  await page.evaluate(() => window.animan!.progress.markCompleted('e2e-series-0001', ['e2e-ep-1']));
  const sheet = await openSettings(page);
  await sheet.getByRole('button', { name: '연결 해제' }).click();
  await expect(sheet.getByRole('button', { name: 'Life Hub 연결' })).toBeVisible();
  await expect(page.getByTestId('settings-attention')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), TOKENS)).toBeNull();
  expect(await page.evaluate(() => window.animan!.progress.getProgress())).toEqual({ 'e2e-series-0001': ['e2e-ep-1'] });
});
