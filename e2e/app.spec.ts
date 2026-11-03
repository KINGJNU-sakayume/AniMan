import { test, expect, SERIES_ID, SERIES_TITLE, openSeries, itemButton, readProgress, readProgressV2 } from './fixtures';

test.describe('Landing (no login)', () => {
  test('opens directly without a login screen', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('내 작품 목록')).toBeVisible();
    await expect(page.getByPlaceholder('아이디')).toHaveCount(0);
    await expect(page.getByText(SERIES_TITLE)).toBeVisible();
    await expect(page.getByText('로컬 초안')).toBeVisible();
  });

  test('exposes the progress API outside the UI', async ({ page }) => {
    await page.goto('./');
    const ids = await page.evaluate(
      (id) => window.animan!.progress.markUpTo(id, 'episode', 2),
      SERIES_ID
    );
    expect(ids).toEqual(['e2e-ep-1', 'e2e-ep-2']);
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-1', 'e2e-ep-2'] });
  });
});

test.describe('Progress storage', () => {
  test('converts v1 data once and leaves the v1 value untouched', async ({ page }) => {
    await page.goto('./');
    const v1 = JSON.stringify({ [SERIES_ID]: ['e2e-ep-1'] });
    await page.evaluate((value) => {
      localStorage.removeItem('animan:progress:v2');
      localStorage.setItem('animan:progress:v1', value);
    }, v1);
    await page.reload();
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-1'] });
    expect(await readProgressV2(page)).toEqual({ [SERIES_ID]: { 'e2e-ep-1': { done: true, at: '1970-01-01T00:00:00.000Z' } } });
    await openSeries(page);
    await itemButton(page, 'Ep 2').click();
    await itemButton(page, 'Ep 1').click();
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-2'] });
    expect(await page.evaluate(() => localStorage.getItem('animan:progress:v1'))).toBe(v1);
  });
});

test.describe('Series view', () => {
  test('renders hero progress bars and timeline', async ({ page }) => {
    await openSeries(page);
    await expect(page.getByText('0 / 3 eps').or(page.getByRole('progressbar').first()).first()).toBeAttached();
    await expect(itemButton(page, 'Ep 1')).toBeVisible();
    await expect(itemButton(page, 'Vol 2')).toBeVisible();
  });

  test('toggling an item persists to localStorage across reloads', async ({ page }) => {
    await openSeries(page);
    const vol1 = itemButton(page, 'Vol 1');
    await expect(vol1).toHaveAttribute('aria-pressed', 'false');
    await vol1.click();
    await expect(itemButton(page, 'Vol 1')).toHaveAttribute('aria-pressed', 'true');
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-vol-1'] });

    await page.reload();
    await openSeries(page);
    await expect(itemButton(page, 'Vol 1')).toHaveAttribute('aria-pressed', 'true');

    await itemButton(page, 'Vol 1').click();
    await expect(itemButton(page, 'Vol 1')).toHaveAttribute('aria-pressed', 'false');
    expect(await readProgress(page)).toEqual({});
  });

  test('can open and close social card', async ({ page, isMobile }) => {
    test.skip(isMobile, '공유 카드 버튼은 데스크톱 레이아웃에만 있음');
    await openSeries(page);
    await page.getByRole('button', { name: 'Share Progress' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('logo returns to landing', async ({ page }) => {
    await openSeries(page);
    await page.getByRole('banner').getByRole('button').first().click();
    await expect(page.getByText('내 작품 목록')).toBeVisible();
  });
});

test.describe('Backup', () => {
  test('exports the versioned backup file', async ({ page }) => {
    await page.goto('./');
    await page.evaluate((id) => window.animan!.progress.markCompleted(id, ['e2e-ep-1']), SERIES_ID);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('진행 기록 백업 내보내기').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^animan-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    // v2: 항목마다 { done, at }. 체크 해제는 done:false 묘비로 파일에도 남는다.
    expect(backup).toMatchObject({ app: 'animan', version: 2, progress: { [SERIES_ID]: { 'e2e-ep-1': { done: true } } } });
    expect(Number.isNaN(Date.parse(backup.progress[SERIES_ID]['e2e-ep-1'].at))).toBe(false);
    expect(typeof backup.exportedAt).toBe('string');
  });

  test('keeps the un-check as a tombstone in the exported file', async ({ page }) => {
    await page.goto('./');
    await page.evaluate((id) => {
      window.animan!.progress.markCompleted(id, ['e2e-ep-1', 'e2e-ep-2']);
      window.animan!.progress.unmarkCompleted(id, ['e2e-ep-1']);
    }, SERIES_ID);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTitle('진행 기록 백업 내보내기').click(),
    ]);
    const chunks: Buffer[] = [];
    for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
    const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(backup.progress[SERIES_ID]['e2e-ep-1'].done).toBe(false);
    expect(backup.progress[SERIES_ID]['e2e-ep-2'].done).toBe(true);
    expect(Date.parse(backup.progress[SERIES_ID]['e2e-ep-1'].at)).toBeGreaterThan(Date.parse(backup.progress[SERIES_ID]['e2e-ep-2'].at) - 1);
  });

  test('imports with preview, merging by default', async ({ page }) => {
    await page.goto('./');
    await page.evaluate((id) => window.animan!.progress.markCompleted(id, ['e2e-ep-1']), SERIES_ID);
    const backup = {
      app: 'animan',
      version: 1,
      exportedAt: '2099-01-02T00:00:00.000Z',
      progress: { [SERIES_ID]: ['e2e-vol-1', 'e2e-ep-1'] },
    };
    await page.getByTestId('backup-file-input').setInputFiles({
      name: 'synthetic-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    const dialog = page.getByRole('dialog', { name: '백업 불러오기 미리보기' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('backup-preview-summary')).toHaveText('추가 1개 · 제거 0개');
    // 승인 전에는 바뀌지 않음
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-1'] });

    await dialog.getByRole('radio', { name: '덮어쓰기' }).check();
    await expect(dialog.getByTestId('backup-preview-summary')).toHaveText('추가 1개 · 제거 0개');
    await dialog.getByRole('radio', { name: /합치기/ }).check();
    await dialog.getByRole('button', { name: '적용' }).click();
    await expect(dialog).not.toBeVisible();
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-1', 'e2e-vol-1'] });
  });

  test('still imports an old v1 backup file: every id enters done at the file\'s exportedAt', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('backup-file-input').setInputFiles({
      name: 'old-v1.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'animan', version: 1, exportedAt: '2026-01-02T03:04:05.000Z', progress: { [SERIES_ID]: ['e2e-ep-3'] } })),
    });
    const dialog = page.getByRole('dialog', { name: '백업 불러오기 미리보기' });
    await expect(dialog.getByText('구형(v1) 백업 파일')).toBeVisible();
    await dialog.getByRole('button', { name: '적용' }).click();
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-3'] });
    expect(await readProgressV2(page)).toEqual({ [SERIES_ID]: { 'e2e-ep-3': { done: true, at: '2026-01-02T03:04:05.000Z' } } });
  });

  test('replacing from a file leaves tombstones for what disappears', async ({ page }) => {
    await page.goto('./');
    await page.evaluate((id) => window.animan!.progress.markCompleted(id, ['e2e-ep-1', 'e2e-ep-2']), SERIES_ID);
    await page.getByTestId('backup-file-input').setInputFiles({
      name: 'replace.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'animan', version: 1, exportedAt: '2026-01-02T00:00:00.000Z', progress: { [SERIES_ID]: ['e2e-ep-2'] } })),
    });
    const dialog = page.getByRole('dialog', { name: '백업 불러오기 미리보기' });
    await dialog.getByRole('radio', { name: '덮어쓰기' }).check();
    await dialog.getByRole('button', { name: '적용' }).click();
    expect(await readProgress(page)).toEqual({ [SERIES_ID]: ['e2e-ep-2'] });
    expect((await readProgressV2(page))[SERIES_ID]['e2e-ep-1'].done).toBe(false);
  });

  test('rejects an invalid backup file', async ({ page }) => {
    await page.goto('./');
    await page.getByTestId('backup-file-input').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ app: 'other', version: 1, progress: {} })),
    });
    await expect(page.getByRole('status')).toContainText('불러오기 실패');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('Admin (local editing)', () => {
  test('opens without a password and saves a local draft', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Add Series' }).click();
    await expect(page.getByRole('heading', { name: 'Admin Dashboard' })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toHaveCount(0);

    await page.getByLabel(/Series Title/).fill('E2E 새 작품');
    await page.getByLabel('JSON bulk import').fill(
      JSON.stringify({ episodes: [{ number: 1, startChapter: 1, endChapter: 3 }], volumes: [] })
    );
    await page.getByRole('button', { name: '이 기기에 초안 저장' }).click();
    await expect(page.getByText('이 기기에 초안으로 저장했습니다.')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '시리즈 JSON 내보내기' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^[0-9a-f-]{36}\.json$/);

    await page.getByRole('button', { name: '뒤로 가기' }).click();
    await expect(page.getByText('E2E 새 작품')).toBeVisible();
  });

  test('editing an existing series keeps item ids', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Add Series' }).click();
    await page.getByLabel('편집 대상').selectOption(SERIES_ID);
    await expect(page.getByLabel('JSON bulk import')).toHaveValue(/e2e-vol-1/);
    await page.getByLabel(/Series Title/).fill('E2E 이름 변경');
    await page.getByRole('button', { name: '이 기기에 초안 저장' }).click();
    const drafts = await page.evaluate(() => JSON.parse(localStorage.getItem('animan:drafts:v1')!));
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe(SERIES_ID);
    expect(drafts[0].title).toBe('E2E 이름 변경');
    expect(drafts[0].volumes.map((v: { id: string }) => v.id)).toEqual(['e2e-vol-1', 'e2e-vol-2']);
  });
});
