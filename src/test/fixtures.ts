// 합성 테스트 데이터 (실제 진행 기록 아님)
import type { SeriesRecord } from '../types';

export const SERIES_ID = 'test-series-0001';

export const syntheticSeries = (overrides: Partial<SeriesRecord> = {}): SeriesRecord => ({
  id: SERIES_ID,
  title: '테스트 작품',
  description: null,
  cover_url: null,
  banner_url: null,
  accent_color: '#ff5500',
  youtube_bgm_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  seasons: [{ id: 'season-1', name: 'S1', start_chapter: 1, end_chapter: 20 }],
  // 일부러 순서를 섞어 둠: 화면/markUpTo는 start_chapter 순서를 따라야 한다
  episodes: [
    { id: 'ep-3', episode_number: '3', title: null, start_chapter: 9, end_chapter: 12, cover_url: null, duration: null },
    { id: 'ep-1', episode_number: '1', title: null, start_chapter: 1, end_chapter: 4, cover_url: null, duration: null },
    { id: 'ep-2', episode_number: '2', title: null, start_chapter: 5, end_chapter: 8, cover_url: null, duration: null },
    { id: 'ep-ova', episode_number: 'OVA', title: null, start_chapter: 13, end_chapter: 14, cover_url: null, duration: null },
  ],
  volumes: [
    { id: 'vol-1', volume_number: 1, start_chapter: 1, end_chapter: 10, cover_url: null },
    { id: 'vol-2', volume_number: 2, start_chapter: 11, end_chapter: 20, cover_url: null },
  ],
  ...overrides,
});
