import { test as base, expect, type Page } from '@playwright/test';

// 합성 데이터만 사용 (실제 진행 기록/카탈로그 아님)
export const SERIES_ID = 'e2e-series-0001';
export const SERIES_TITLE = 'E2E 테스트 작품';

export const syntheticSeries = {
  id: SERIES_ID,
  title: SERIES_TITLE,
  description: '합성 테스트 데이터',
  cover_url: null,
  banner_url: null,
  accent_color: '#ff5500',
  youtube_bgm_id: null,
  created_at: '2099-01-01T00:00:00.000Z',
  seasons: [{ id: 'e2e-season-1', name: 'Season 1', start_chapter: 1, end_chapter: 20 }],
  episodes: [
    { id: 'e2e-ep-1', episode_number: '1', title: null, start_chapter: 1, end_chapter: 5, cover_url: null, duration: 24 },
    { id: 'e2e-ep-2', episode_number: '2', title: null, start_chapter: 6, end_chapter: 10, cover_url: null, duration: 24 },
    { id: 'e2e-ep-3', episode_number: '3', title: null, start_chapter: 11, end_chapter: 15, cover_url: null, duration: 24 },
  ],
  volumes: [
    { id: 'e2e-vol-1', volume_number: 1, start_chapter: 1, end_chapter: 10, cover_url: null },
    { id: 'e2e-vol-2', volume_number: 2, start_chapter: 11, end_chapter: 20, cover_url: null },
  ],
};

/** 매 테스트마다 합성 시리즈를 "로컬 초안"으로 주입한 페이지 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, provide) => {
    await page.addInitScript((series) => {
      localStorage.setItem('animan:drafts:v1', JSON.stringify([series]));
    }, syntheticSeries);
    await provide(page);
  },
});

export { expect };

/** 화면에 보이는 완료 목록({ 작품 id: 완료 id[] }). 저장 형식은 v2(묘비 포함)라서 done:true 만 뽑아 낸다. */
export const readProgress = (page: Page) =>
  page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('animan:progress:v2') ?? 'null');
    const out: Record<string, string[]> = {};
    for (const [seriesId, items] of Object.entries((doc?.progress ?? {}) as Record<string, Record<string, { done: boolean }>>)) {
      const ids = Object.entries(items).filter(([, e]) => e.done).map(([id]) => id);
      if (ids.length > 0) out[seriesId] = ids;
    }
    return out;
  });

/** 저장된 v2 항목({ done, at }) 전체(묘비 포함). */
export const readProgressV2 = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('animan:progress:v2') ?? '{"progress":{}}').progress as Record<string, Record<string, { done: boolean; at: string }>>);

export const openSeries = async (page: Page) => {
  await page.goto('./');
  await page.getByText(SERIES_TITLE).first().click();
  await expect(page.getByRole('heading', { name: 'My Progress Tracker' }).first()).toBeVisible();
  // 모바일 타임라인은 접힌 상태로 시작한다
  const expand = page.getByRole('button', { name: '펼치기' });
  if (await expand.isVisible()) await expand.click();
};

/** 화면 크기에 따라 보이는 타임라인 항목 버튼 (데스크톱/모바일 공통) */
export const itemButton = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label} \\(`) }).filter({ visible: true }).first();

/** 헤더 톱니로 「설정」 시트를 연다(이미 열려 있으면 그대로). */
export const openSettings = async (page: Page) => {
  const sheet = page.getByRole('dialog', { name: '설정' });
  if (!(await sheet.isVisible())) await page.getByRole('button', { name: /^설정/ }).click();
  await expect(sheet).toBeVisible();
  return sheet;
};
