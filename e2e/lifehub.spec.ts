import { test, expect, SERIES_ID, SERIES_TITLE, openSettings, readProgress } from './fixtures';

// Life Hub cards stage 6. Synthetic data only; the Life Hub API is faked.
const HUB = 'https://life-hub-api.213303.workers.dev';
const item = (key: string, payload: Record<string, unknown>, status = 'approved') => ({
  key, status, revision: 0, final_candidate: null, needs_app_review: false,
  candidate: { schema_version: 1, candidate_type: 'media_progress', source: 'claude', idempotency_key: key.slice(7), created_at: '2026-11-02T01:00:00Z', payload },
});

test('opening AniMan marks what the owner approved in a Claude card, shares titles, and leaves the rest', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const exact = 'claude:mcp-' + 'a'.repeat(40);
  const missing = 'claude:mcp-' + 'b'.repeat(40);
  const posts: Array<Record<string, string>> = [];
  const puts: Array<{ revision: number; items: Array<{ id: string; label: string }> }> = [];
  const list = [
    item(exact, { title: SERIES_TITLE, kind: 'episode', up_to: 2 }),
    item(missing, { title: SERIES_TITLE, kind: 'volume', numbers: [9] }),
  ];
  await page.route(HUB + '/**', async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.method() === 'PUT') { puts.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ status: 200, headers: cors, body: '{}' }); }
    if (req.method() === 'POST') { posts.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ status: 200, headers: cors, body: '{}' }); }
    const done = new Set(posts.map((p) => p.key));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ candidates: list.filter((c) => !done.has(c.key)) }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('animan.lifehub.tokens.v1', JSON.stringify({ access_token: 'at', refresh_token: 'rt', access_expires_at: Date.now() + 3_600_000 }));
  });
  await page.goto('./');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ key: exact, entity_type: 'media_progress', entity_id: SERIES_ID });
  expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-1', 'e2e-ep-2'] });
  expect(puts[0].items.some((s) => s.id === SERIES_ID && s.label === SERIES_TITLE)).toBe(true);
  // A number that does not exist waits for the owner, marked as approved in the card.
  await expect(page.getByTestId('lifehub-count')).toHaveText('1');
  await page.getByTitle('Claude가 제안한 진행 기록').click();
  await expect(page.getByText(/Claude에서 승인한 진행 1개를 기록했어요/)).toBeVisible();
  await expect(page.getByText('Claude 카드에서 승인함')).toBeVisible();
  await expect(page.getByText('이 작품에 없는 번호: 9')).toBeVisible();
  // The auto-apply preference lives in 설정 › Life Hub now.
  await page.getByRole('dialog', { name: 'Claude가 제안한 진행 기록' }).getByRole('button', { name: '닫기' }).click();
  const settings = await openSettings(page);
  await expect(settings.getByLabel(/Claude에서 승인한 기록은 바로 반영/)).toBeChecked();
  expect(errors).toEqual([]);
});
