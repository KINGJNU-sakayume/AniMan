import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect, SERIES_ID, SERIES_TITLE, itemButton, openSettings, readProgress, syntheticSeries } from './fixtures';
import { createFakeSyncServer, type FakeSyncServer } from '../src/test/fakeSyncServer';

// 기기 동기화 수렴 확인 (P6 2단계). 브라우저 컨텍스트마다 localStorage 가 따로라 "기기"가 된다.
// Life Hub 는 page.route 로 메모리 안의 가짜 동기화 서버(version·412·sha256 은 life-hub 구현대로)에 연결한다.
// 실제 Life Hub 에는 요청을 보내지 않고, 데이터는 전부 합성이다.
const HUB = 'https://life-hub-api.213303.workers.dev';
const API_PATH = '/animan/v1';

// 두 컨텍스트를 직접 만들기 때문에 모바일 프로젝트에서는 다시 돌리지 않는다.
test.skip(({ isMobile }) => isMobile, 'two-context convergence runs once, on desktop');

/** 기기별 "Life Hub 에 닿지 않음" 스위치. (context.setOffline 은 page.route 로 가로챈 요청을 막지 못해서 라우트에서 직접 끊는다.) */
interface Net { down: boolean }

async function newDevice(browser: Browser, baseURL: string | undefined, server: FakeSyncServer, net: Net, options: { scope?: string } = {}) {
  const context = await browser.newContext({ baseURL });
  const scope = options.scope ?? 'animan:inbox animan:sync';
  await context.addInitScript(({ series, scope: grant }) => {
    localStorage.setItem('animan:drafts:v1', JSON.stringify([series]));
    // 연결된 기기: 토큰은 처음 한 번만 심는다(이후 탐색에서 지워진 토큰을 되살리지 않게).
    if (!localStorage.getItem('animan.lifehub.tokens.v1') && !sessionStorage.getItem('e2e-token-seeded')) {
      sessionStorage.setItem('e2e-token-seeded', '1');
      localStorage.setItem('animan.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: Date.now() + 3_600_000, scope: grant }));
    }
  }, { series: syntheticSeries, scope });
  await context.route(HUB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    // life-hub 의 CORS 응답과 같은 값(workers-oauth-provider): Authorization 만 명시하고 나머지는 *.
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': 'Authorization, *',
      'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After',
    };
    if (net.down) return route.abort('internetdisconnected');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = url.pathname.startsWith(API_PATH) ? url.pathname.slice(API_PATH.length) : url.pathname;
    if (path === '/sync' || path.startsWith('/sync/')) {
      const res = await server.handle({ method: req.method(), path, headers: req.headers(), body: req.postData() ?? undefined });
      return route.fulfill({ status: res.status, headers: { ...res.headers, ...cors }, body: res.body });
    }
    // 인박스 쪽은 비어 있는 Life Hub 처럼 응답한다.
    const body = req.method() === 'GET' ? JSON.stringify({ candidates: [] }) : '{}';
    return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body });
  });
  const page = await context.newPage();
  return { context, page };
}
type Device = { context: BrowserContext; page: Page; net: Net };

// 오프라인일 때는 page.goto 를 쓸 수 없으니, 앱 안에서 화면을 오간다.
const seriesView = async (page: Page) => {
  if (page.url() === 'about:blank') await page.goto('./');
  if (!(await page.getByRole('heading', { name: 'My Progress Tracker' }).first().isVisible())) {
    await page.getByText(SERIES_TITLE).first().click();
  }
  await expect(page.getByRole('heading', { name: 'My Progress Tracker' }).first()).toBeVisible();
};

// 동기화 화면은 설정 시트(톱니) › Life Hub 섹션이다. 톱니는 목록·시리즈 화면 어디에나 있다.
const openDialog = async (page: Page) => {
  if (page.url() === 'about:blank') await page.goto('./');
  return openSettings(page);
};
const closeDialog = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: '설정' });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: '닫기' }).first().click();
};

/** 「지금 동기화」를 누르고, 한 번의 동기화가 끝나(마지막 동기화 시각이 바뀜) 평소 상태로 돌아올 때까지 기다린다. */
const syncNow = async (page: Page) => {
  const dialog = await openDialog(page);
  const status = dialog.getByTestId('sync-status');
  const before = await status.getAttribute('data-last');
  await dialog.getByRole('button', { name: '지금 동기화' }).click();
  await expect(status).not.toHaveAttribute('data-last', before ?? '');
  await expect(status).toHaveAttribute('data-phase', 'idle');
  await expect(status).toContainText(/^연결됨 · .+ 동기화$/);
  await closeDialog(page);
};

const pressed = async (page: Page, label: string) => {
  await seriesView(page);
  return (await itemButton(page, label).getAttribute('aria-pressed')) === 'true';
};
const toggle = async (page: Page, label: string) => {
  await seriesView(page);
  await itemButton(page, label).click();
  // 같은 ms 안의 연타가 아니라 "더 늦게"가 분명해지도록 간격을 둔다.
  await page.waitForTimeout(40);
};

test.describe('two devices converge through the (fake) Life Hub sync API', () => {
  let server: FakeSyncServer;
  let devices: Device[] = [];
  test.beforeEach(() => {
    server = createFakeSyncServer();
    devices = [];
  });
  test.afterEach(async () => {
    await Promise.all(devices.map((d) => d.context.close()));
  });
  const device = async (browser: Browser, baseURL: string | undefined, options: { scope?: string } = {}) => {
    const net: Net = { down: false };
    const d = await newDevice(browser, baseURL, server, net, options);
    devices.push({ ...d, net });
    return d.page;
  };
  const setDown = (page: Page, down: boolean) => {
    devices.find((d) => d.page === page)!.net.down = down;
  };

  test('A checks, B un-checks later: both end up un-checked', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL);
    const b = await device(browser, baseURL);

    await toggle(a, 'Ep 1');
    expect(await readProgress(a)).toEqual({ [SERIES_ID]: ['e2e-ep-1'] });
    await syncNow(a);
    expect(server.document()?.progress[SERIES_ID]['e2e-ep-1'].done).toBe(true);

    await syncNow(b); // B pulls A's check (connected = sync on, no switch)
    expect(await pressed(b, 'Ep 1')).toBe(true);

    await toggle(b, 'Ep 1'); // later, on B
    expect(await pressed(b, 'Ep 1')).toBe(false);
    await syncNow(b);
    expect(server.document()?.progress[SERIES_ID]['e2e-ep-1'].done).toBe(false);

    await syncNow(a);
    expect(await pressed(a, 'Ep 1')).toBe(false);
    expect(await readProgress(a)).toEqual({});
    expect(await readProgress(b)).toEqual({});
    // 서버가 받은 기기 이름은 출력 가능한 ASCII 뿐이다
    expect(server.current()?.device).toMatch(/^[\x20-\x7e]{1,40}$/);
  });

  for (const order of ['A first', 'B first'] as const) {
    test(`offline edits on both sides settle the same way regardless of order (${order})`, async ({ browser, baseURL }) => {
      const a = await device(browser, baseURL);
      const b = await device(browser, baseURL);

      await toggle(a, 'Ep 1');
      await syncNow(a);
      await syncNow(b);
      expect(await pressed(b, 'Ep 1')).toBe(true);

      setDown(a, true);
      setDown(b, true);
      // A: un-check then check again (Ep 1 is done, newest on A), and checks Ep 2.
      await toggle(a, 'Ep 1');
      await toggle(a, 'Ep 1');
      await toggle(a, 'Ep 2');
      // B, later: un-checks Ep 1 and checks Vol 1.
      await toggle(b, 'Ep 1');
      await toggle(b, 'Vol 1');
      setDown(a, false);
      setDown(b, false);

      const sequence = order === 'A first' ? [a, b, a, b] : [b, a, b, a];
      for (const page of sequence) await syncNow(page);

      // B's un-check is later than A's re-check, so Ep 1 ends un-checked; everything else is the union.
      const expected = { [SERIES_ID]: ['e2e-ep-2', 'e2e-vol-1'] };
      expect((await readProgress(a))[SERIES_ID]?.slice().sort()).toEqual(expected[SERIES_ID]);
      expect((await readProgress(b))[SERIES_ID]?.slice().sort()).toEqual(expected[SERIES_ID]);
      expect(await pressed(a, 'Ep 1')).toBe(false);
      expect(await pressed(b, 'Ep 1')).toBe(false);
      const doc = server.document()!.progress[SERIES_ID];
      expect(Object.fromEntries(Object.entries(doc).map(([id, e]) => [id, e.done]))).toEqual({ 'e2e-ep-1': false, 'e2e-ep-2': true, 'e2e-vol-1': true });
    });
  }

  test('a failed sync (server down) changes nothing locally and recovers when it is back', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL);
    await toggle(a, 'Ep 1');
    await syncNow(a);
    setDown(a, true);
    await toggle(a, 'Ep 2');
    const dialog = await openDialog(a);
    await dialog.getByRole('button', { name: '지금 동기화' }).click();
    await expect(dialog.getByTestId('sync-status')).toHaveAttribute('data-phase', 'retry');
    // 네트워크 문제로 재시도 대기는 「확인 필요」가 아니라 평소 상태(B)의 문구다
    await expect(dialog.getByTestId('sync-status')).toHaveText('연결됨 · 잠시 뒤 다시 시도');
    await expect(dialog.getByTestId('lifehub-attention')).toHaveCount(0);
    await closeDialog(a);
    expect(await readProgress(a)).toEqual({ [SERIES_ID]: ['e2e-ep-1', 'e2e-ep-2'] });
    setDown(a, false);
    await syncNow(a);
    expect(Object.keys(server.document()!.progress[SERIES_ID]).sort()).toEqual(['e2e-ep-1', 'e2e-ep-2']);
  });

  test('a token without the sync scope shows 「확인 필요」 with 다시 연결 and keeps the connection (the inbox still works)', async ({ browser, baseURL }) => {
    server.state.syncScope = false;
    const a = await device(browser, baseURL, { scope: 'animan:inbox' });
    await a.goto('./');
    // 설정 진입점의 점과 접근성 이름
    await expect(a.getByRole('button', { name: '설정 (확인 필요)' })).toBeVisible();
    await expect(a.getByTestId('settings-attention')).toBeVisible();
    const dialog = await openDialog(a);
    await expect(dialog.getByTestId('sync-status')).toHaveAttribute('data-phase', 'no_permission');
    await expect(dialog.getByTestId('sync-status')).toHaveText('확인 필요');
    await expect(dialog.getByTestId('lifehub-attention')).toContainText('동기화 권한이 없는 연결입니다. 한 번 다시 연결하면 제안과 동기화가 함께 켜집니다.');
    await expect(dialog.getByRole('button', { name: '다시 연결' })).toBeVisible();
    // 연결은 그대로: 연결 해제 버튼이 보이고 토큰이 남아 있다
    await expect(dialog.getByRole('button', { name: '연결 해제' })).toBeVisible();
    expect(await a.evaluate(() => localStorage.getItem('animan.lifehub.tokens.v1'))).not.toBeNull();
    expect(server.log).toHaveLength(0); // 권한이 없는 걸 아는 토큰으로는 요청도 보내지 않는다
  });

  test('a device that rested 180+ days reviews first: cancel changes nothing, confirm removes what was deleted elsewhere', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL);
    await toggle(a, 'Ep 1');
    await toggle(a, 'Ep 2');
    await syncNow(a);
    await toggle(a, 'Vol 1'); // a real offline edit after the last sync (later than F)
    // Another device deleted Ep 1 long ago and its tombstone has been pruned: the server just has no entry for it.
    const doc = server.document()!;
    delete doc.progress[SERIES_ID]['e2e-ep-1'];
    const put = await server.handle({
      method: 'PUT', path: '/sync',
      headers: { authorization: 'Bearer x', 'content-type': 'application/json', 'if-match': `"${server.current()!.version}"` },
      body: JSON.stringify(doc),
    });
    expect(put.status).toBe(200);
    // Make this device "stale": its last successful sync was 181 days ago.
    await a.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('animan.sync.state.v1')!);
      state.lastSyncAt = Date.now() - 181 * 86_400_000;
      localStorage.setItem('animan.sync.state.v1', JSON.stringify(state));
    });
    await a.goto('./');
    const dialog = await openDialog(a);
    await expect(dialog.getByTestId('sync-status')).toHaveAttribute('data-phase', 'needs_review');
    await expect(dialog.getByRole('button', { name: '동기화 재개' })).toHaveCount(0); // no way around the review

    await dialog.getByRole('button', { name: '서버 문서 검토' }).click();
    const review = a.getByRole('dialog', { name: '오래 쉰 기기 검토' });
    await expect(review.getByTestId('stale-remove-count')).toHaveText('다른 기기에서 지워진 것으로 보이는 항목 1개');
    await expect(review.getByTestId('stale-remove-list')).toContainText('E2E 테스트 작품');
    await expect(review.getByTestId('stale-remove-list')).toContainText('Ep 1');
    await expect(review.getByTestId('stale-remove-list')).not.toContainText('Vol 1');
    const [download] = await Promise.all([a.waitForEvent('download'), review.getByRole('button', { name: '현재 로컬 진행도 내려받기' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^animan-backup-/);

    // Cancel: nothing changes and it stays stopped.
    await review.getByRole('button', { name: '취소' }).click();
    expect(await readProgress(a)).toEqual({ [SERIES_ID]: ['e2e-ep-1', 'e2e-ep-2', 'e2e-vol-1'] });
    const again = await openDialog(a);
    await expect(again.getByTestId('sync-status')).toHaveAttribute('data-phase', 'needs_review');
    await expect(again.getByTestId('sync-status')).toHaveAttribute('data-last', /^\d+$/);
    await expect(a.getByRole('button', { name: '설정 (확인 필요)' })).toHaveCount(1);

    // Confirm: Ep 1 is removed, the rest is merged, the review is released and it syncs.
    await again.getByRole('button', { name: '서버 문서 검토' }).click();
    await a.getByRole('dialog', { name: '오래 쉰 기기 검토' }).getByRole('button', { name: '지우고 병합 적용' }).click();
    const after = await openDialog(a);
    await expect(after.getByTestId('sync-status')).toHaveAttribute('data-phase', 'idle');
    await expect.poll(async () => (await readProgress(a))[SERIES_ID]).toEqual(['e2e-ep-2', 'e2e-vol-1']);
    await expect.poll(() => Object.keys(server.document()!.progress[SERIES_ID]).sort()).toEqual(['e2e-ep-2', 'e2e-vol-1']);
    expect(server.document()!.progress[SERIES_ID]['e2e-ep-1']).toBeUndefined(); // no resurrection, no tombstone
  });

  test('the device name is saved and sent, and an unusable one falls back to the default', async ({ browser, baseURL }) => {
    const a = await device(browser, baseURL);
    await toggle(a, 'Ep 1');
    const dialog = await openDialog(a);
    await dialog.getByText('고급').click(); // 접힌 「고급」 안에 있다
    const input = dialog.getByLabel(/기기 이름/);
    await input.fill('  Desk PC  ');
    await input.blur();
    await syncNow(a);
    expect(server.current()?.device).toBe('Desk PC');
  });
});
