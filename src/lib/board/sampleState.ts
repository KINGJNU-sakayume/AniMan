// 보드 예시 출력(board/sample.json)을 만드는 지어낸 상태. 실제 작품·기록이 아니다.
// 포스터 경로도 지어낸 값이다(실제 TMDB 경로가 아님).
import type { SeriesRecord } from '../../types';
import type { ProgressV2 } from '../progress/model';

export const sampleSeries = (
  id: string, title: string, episodes: number, color: string, poster: string | null, seasonSplit?: number
): SeriesRecord => ({
  id, title, description: null, cover_url: null, banner_url: null, accent_color: color, youtube_bgm_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...(poster ? { tmdb_id: 1, tmdb_media_type: 'tv' as const, tmdb_poster_path: poster } : {}),
  seasons: seasonSplit
    ? [
        { id: `${id}-s1`, name: 'SEASON 1', start_chapter: 1, end_chapter: seasonSplit * 4 },
        { id: `${id}-s2`, name: 'SEASON 2', start_chapter: seasonSplit * 4 + 1, end_chapter: null },
      ]
    : [{ id: `${id}-s1`, name: 'SEASON 1', start_chapter: 1, end_chapter: null }],
  episodes: Array.from({ length: episodes }, (_, i) => ({
    id: `${id}-e${i + 1}`, episode_number: String(i + 1), title: `가상 에피소드 ${i + 1}`,
    start_chapter: i * 4 + 1, end_chapter: i * 4 + 4, cover_url: null, duration: 24,
  })),
  volumes: [],
});

export const SAMPLE_NOW = Date.UTC(2026, 10, 7, 3, 0, 0);

export const sampleCatalog: SeriesRecord[] = [
  sampleSeries('sample-a', '가상 모험담', 12, '#166FBB', '/sample-poster-a.jpg', 6),
  sampleSeries('sample-b', '가상 학원 코미디', 12, '#FF69B4', '/sample-poster-b.jpg'),
  sampleSeries('sample-c', '가상 우주 여행', 24, '#4b0082', null),
  sampleSeries('sample-d', '가상 요리 일지', 10, '#03acb1', '/sample-poster-d.jpg'),
];

const at = (day: number, hour: number) => new Date(Date.UTC(2026, 10, day, hour, 0, 0)).toISOString();
const doneRange = (id: string, from: number, to: number, day: number): ProgressV2[string] =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`${id}-e${from + i}`, { done: true, at: at(day, 8 + from + i) }]));

export const sampleProgress: ProgressV2 = {
  'sample-a': doneRange('sample-a', 1, 8, 6),
  'sample-b': doneRange('sample-b', 1, 12, 4),
  'sample-c': { ...doneRange('sample-c', 1, 3, 5), 'sample-c-e5': { done: true, at: at(5, 20) } },
  'sample-d': doneRange('sample-d', 1, 10, 2),
};
