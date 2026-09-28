import { test, expect, type Page } from '@playwright/test';
import { mockSupabase } from './support/mockSupabase';

const JJK = 'jujutsu-kaisen';
const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

async function openSeries(page: Page, title = '주술회전') {
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await expect(page).toHaveURL(/#\/series\//);
  await expect(page.getByText('My Progress Tracker')).toBeVisible();
}

test.describe('작품 목록', () => {
  test('카드와 진도가 보이고, 일반 사용자에게는 관리자 버튼이 없다', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'tester', progress: { [JJK]: [`${JJK}-e1`, `${JJK}-e2`] } });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: '내 작품 목록' })).toBeVisible();
    await expect(page.getByRole('button', { name: /주술회전/ })).toContainText('다음 · Ep 3');
    await expect(page.getByTitle('작품 추가 (관리자)')).toHaveCount(0);
  });

  test('관리자는 헤더의 작품 추가 버튼을 누를 수 있다 (로그아웃 버튼에 가려지지 않음)', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'admin' });
    await page.goto('./');
    await page.getByTitle('작품 추가 (관리자)').click();
    await expect(page).toHaveURL(/#\/admin/);
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
  });

  test('목록 조회 실패 시 다시 시도', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'tester', failTables: ['series'] });
    await page.goto('./');
    await expect(page.getByText('작품 목록을 불러오지 못했습니다.')).toBeVisible();
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });
});

test.describe('작품 화면', () => {
  test('해시 라우팅: 새로고침·뒤로 가기', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'tester' });
    await page.goto('./');
    await openSeries(page);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: '주술회전' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: '내 작품 목록' })).toBeVisible();
  });

  test('항목을 누르면 완료가 저장된다', async ({ page }) => {
    const mock = await mockSupabase(page, { loginAs: 'tester' });
    await page.goto(`./#/series/${JJK}`);
    const item = isMobile(page) ? page.locator(`#card-${JJK}-e1`) : page.locator(`#node-${JJK}-e1`);
    await item.click();
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => mock.storedProgress(JJK)).toEqual([`${JJK}-e1`]);
  });

  test('여기까지 모두 완료 + 실행 취소', async ({ page }) => {
    const mock = await mockSupabase(page, { loginAs: 'tester' });
    await page.goto(`./#/series/${JJK}`);
    if (isMobile(page)) {
      const card = page.locator(`#card-${JJK}-e5`);
      await card.scrollIntoViewIfNeeded();
      await card.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 10, clientY: 10 }] });
      await page.waitForTimeout(700);
      await card.dispatchEvent('touchend');
    } else {
      await page.locator(`#node-${JJK}-e5`).click({ button: 'right' });
    }
    await expect(page.getByText('Ep 5까지 5개 완료 처리')).toBeVisible();
    await expect.poll(() => mock.storedProgress(JJK).length).toBe(5);
    await page.getByRole('button', { name: '실행 취소' }).click();
    await expect.poll(() => mock.storedProgress(JJK).length).toBe(0);
  });

  test('공유 카드 열고 Esc 로 닫기', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'tester' });
    await page.goto(`./#/series/${JJK}`);
    await page.getByRole('button', { name: isMobile(page) ? '진도 공유 카드' : 'Share Progress' }).click();
    const dialog = page.getByRole('dialog', { name: '진도 공유 카드' });
    await expect(dialog).toBeVisible();
    // 카드가 화면 안에 완전히 들어와야 한다
    const box = (await dialog.locator('.story-card-body').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('로그아웃', async ({ page }) => {
    await mockSupabase(page, { loginAs: 'tester' });
    await page.goto('./');
    await page.getByTitle('로그아웃').click();
    await expect(page.getByPlaceholder('아이디')).toBeVisible();
  });
});

test.describe('회귀: 스크롤 제스처가 항목을 바꾸면 안 된다', () => {
  test('PC: 드래그 스크롤 후 놓아도 토글되지 않음', async ({ page }) => {
    test.skip(isMobile(page), 'PC 전용');
    const mock = await mockSupabase(page, { loginAs: 'tester' });
    await page.goto(`./#/series/${JJK}`);
    const node = page.locator(`#node-${JJK}-e3`);
    await node.scrollIntoViewIfNeeded();
    const box = (await node.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 - i * 10, box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForTimeout(300);
    expect(mock.calls.filter((c) => c.table === 'user_progress' && c.method === 'POST')).toHaveLength(0);
  });

  test('모바일: 카드 위에서 시작한 느린 스크롤은 롱프레스가 아님', async ({ page }) => {
    test.skip(!isMobile(page), '모바일 전용');
    const mock = await mockSupabase(page, { loginAs: 'tester' });
    await page.goto(`./#/series/${JJK}`);
    const card = page.locator(`#card-${JJK}-e20`);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = box.x + 20, y = box.y + 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 14; i++) {
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 14 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    expect(mock.calls.filter((c) => c.table === 'user_progress' && c.method === 'POST')).toHaveLength(0);
  });
});

test.describe('관리자', () => {
  test('JSON 검증 요약과 저장', async ({ page }) => {
    const mock = await mockSupabase(page, { loginAs: 'admin' });
    await page.goto('./#/admin');
    await page.getByLabel('Series Title').fill('테스트 작품');
    const json = page.getByLabel('JSON bulk import');
    await json.fill('{ "episodes": [ ');
    await expect(page.getByRole('status').filter({ hasText: 'JSON' })).toBeVisible();
    await json.fill('{"episodes":[{"number":1,"startChapter":1,"endChapter":2}],"volumes":[{"number":1,"startChapter":1,"endChapter":5}]}');
    await expect(page.getByText('시즌 0 · 에피소드 1 · 단행본 1')).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText("'테스트 작품' 저장 완료")).toBeVisible();
    expect(mock.tables.series.some((s) => s.title === '테스트 작품')).toBe(true);
    expect(mock.tables.episodes.filter((e) => e.series_id === mock.tables.series.at(-1)!.id)).toHaveLength(1);
  });
});
