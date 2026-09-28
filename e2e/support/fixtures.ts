// e2e/support/fixtures.ts
// Realistic series data (formerly src/lib/mockData.ts) shaped as Supabase rows.
// Chapter ranges are kept irregular on purpose — overlaps, gaps, combined
// episodes ('7-11') and an open-ended season all exercise the timeline layout.

export const IMAGE_HOST = 'https://img.animan-e2e.test';

type EpisodeTuple = [number: number | string, start: number, end: number, duration?: number];
type VolumeTuple = [number: number, start: number, end: number, hasCover?: boolean];
type SeasonTuple = [name: string, start: number, end: number | null];

interface SeriesSeed {
  id: string;
  title: string;
  description: string | null;
  accent: string;
  bgm: string | null;
  banner: boolean;
  seasons: SeasonTuple[];
  episodes: EpisodeTuple[];
  volumes: VolumeTuple[];
}

const SEEDS: SeriesSeed[] = [
  {
    id: 'jujutsu-kaisen',
    title: '주술회전',
    description:
      '경이로운 신체 능력을 가진 고등학생 이타도리 유지가 저주의 왕 양면 스쿠나의 손가락을 먹게 되면서 벌어지는 이야기. 저주를 퇴치하는 주술사들의 싸움이 시작된다.',
    accent: '#166FBB',
    bgm: 'DAjS4rGPMGo',
    banner: true,
    seasons: [['SEASON 1', 1, 63], ['SEASON 2', 64, 136], ['SEASON 3 (TBA)', 137, null]],
    episodes: [
      [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 5], [5, 6, 8], [6, 9, 11], [7, 12, 15], [8, 16, 18],
      [9, 19, 21], [10, 22, 23], [11, 24, 26], [12, 27, 29], [13, 30, 31], [14, 32, 33], [15, 34, 36],
      [16, 37, 40], [17, 40, 42], [18, 43, 45], [19, 46, 49], [20, 50, 52], [21, 53, 54], [22, 55, 56],
      [23, 57, 59], [24, 60, 63], [25, 65, 66], [26, 67, 69], [27, 70, 72], [28, 73, 75], [29, 76, 78],
      [30, 79, 80], [31, 81, 82], [32, 83, 87], [33, 88, 90], [34, 91, 93], [35, 94, 97], [36, 98, 101],
      [37, 102, 106], [38, 107, 110], [39, 111, 114], [40, 115, 116], [41, 117, 119], [42, 120, 121],
      [43, 122, 125], [44, 126, 127], [45, 128, 131], [46, 132, 134], [47, 135, 136],
    ].map(([n, s, e]) => [n, s, e, 24] as EpisodeTuple),
    volumes: [
      [1, 1, 7, true], [2, 8, 16, true], [3, 17, 25, true], [4, 26, 34, true], [5, 35, 43], [6, 44, 52],
      [7, 53, 61], [8, 62, 70], [9, 71, 79], [10, 80, 88], [11, 89, 97], [12, 98, 106], [13, 107, 115],
      [14, 116, 124], [15, 125, 133], [16, 134, 142],
    ],
  },
  {
    id: 'frieren',
    title: '장송의 프리렌',
    description:
      '마왕을 물리친 용사 일행 중, 천 년 이상 사는 엘프 마법사 프리렌이 인간 동료들의 죽음을 격으며 뒤늦게 인간을 알아가기 위해 떠나는 여정.',
    accent: '#03acb1',
    bgm: null,
    banner: true,
    seasons: [['SEASON 1', 1, 60], ['SEASON 2 (TBA)', 61, 80]],
    episodes: [
      [1, 1, 2, 24], [2, 2, 3, 24], [3, 4, 5, 24], [4, 6, 8, 24], [5, 8, 10, 24], [6, 11, 12, 24],
      ['7-11', 13, 23, 120], ['12-17', 25, 36, 144], ['18-28', 37, 60, 264],
    ],
    volumes: [
      [1, 1, 7, true], [2, 8, 17, true], [3, 18, 27, true], [4, 28, 37, true], [5, 38, 47, true],
      [6, 48, 57, true], [7, 58, 67, true],
    ],
  },
  {
    id: 'oshi-no-ko',
    title: '최애의 아이\n(推しの子)',
    description:
      '지방 도시에서 일하는 산부인과 의사 고로는 어느 날 그의 "최애" 아이돌 호시노 아이를 만나게 되는데... 연예계의 빛과 그림자를 다룬 이야기.',
    accent: '#FF1493',
    bgm: 'DAjS4rGPMGo',
    banner: true,
    seasons: [],
    episodes: [
      [1, 1, 10, 90], [2, 11, 13, 24], [3, 14, 16, 24], [4, 17, 19, 24], [5, 20, 21, 24], [6, 22, 24, 24],
      [7, 25, 27, 24], [8, 28, 30, 24], [9, 31, 32, 24], [10, 33, 35, 24], [11, 36, 40, 24],
      [12, 41, 44, 24], [13, 45, 46, 24], [14, 47, 50, 24], [15, 51, 54, 24], [16, 55, 58, 24],
      [17, 59, 61, 24], [18, 62, 65, 24], [19, 66, 68, 24],
    ],
    volumes: [
      [1, 1, 10, true], [2, 11, 20, true], [3, 21, 30, true], [4, 31, 40, true], [5, 41, 50, true],
      [6, 51, 60, true], [7, 61, 70, true], [8, 71, 80, true],
    ],
  },
  {
    id: 'bocchi-the-rock',
    title: '봇치 더 록!',
    description: null,
    accent: '#ff78ae',
    bgm: null,
    banner: false,
    seasons: [['SEASON 1', 1, 21], ['SEASON 2 (TBA)', 22, 40]],
    episodes: [
      [1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 5], [5, 6, 6], [6, 7, 8], [7, 9, 11], [8, 12, 12],
      [9, 13, 14], [10, 15, 16], [11, 17, 18], [12, 19, 21],
    ].map(([n, s, e]) => [n, s, e, 24] as EpisodeTuple),
    volumes: [[1, 1, 12, true], [2, 13, 24, true], [3, 25, 36], [4, 37, 48], [5, 49, 60], [6, 61, 72]],
  },
];

export interface SeriesRow {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  banner_url: string | null;
  accent_color: string;
  youtube_bgm_id: string | null;
  created_at: string;
}
export interface SeasonRow { id: string; series_id: string; name: string; start_chapter: number; end_chapter: number | null }
export interface EpisodeRow {
  id: string; series_id: string; episode_number: string; title: string | null;
  start_chapter: number; end_chapter: number; cover_url: string | null; duration: number | null;
}
export interface VolumeRow {
  id: string; series_id: string; volume_number: number;
  start_chapter: number; end_chapter: number; cover_url: string | null;
}
export interface ProfileRow { id: string; username: string; is_approved: boolean; role: string }
export interface ProgressRow { id: string; user_id: string; series_id: string; completed_ids: string[]; updated_at: string }

export interface MockTables {
  series: SeriesRow[];
  seasons: SeasonRow[];
  episodes: EpisodeRow[];
  volumes: VolumeRow[];
  profiles: ProfileRow[];
  user_progress: ProgressRow[];
  [table: string]: Record<string, unknown>[];
}

const img = (kind: 'banner' | 'cover' | 'volume', key: string, label: string, accent: string) =>
  `${IMAGE_HOST}/${kind}/${encodeURIComponent(key)}.svg?label=${encodeURIComponent(label)}&accent=${encodeURIComponent(accent)}`;

/** Builds a fresh, mutable copy of the fixture database. */
export function buildTables(): MockTables {
  const tables: MockTables = { series: [], seasons: [], episodes: [], volumes: [], profiles: [], user_progress: [] };

  SEEDS.forEach((seed, seriesIndex) => {
    const plainTitle = seed.title.split('\n')[0];
    tables.series.push({
      id: seed.id,
      title: seed.title,
      description: seed.description,
      cover_url: img('cover', seed.id, plainTitle, seed.accent),
      banner_url: seed.banner ? img('banner', seed.id, plainTitle, seed.accent) : null,
      accent_color: seed.accent,
      youtube_bgm_id: seed.bgm,
      // Newest first in the landing grid follows fixture order.
      created_at: new Date(Date.UTC(2026, 0, 30 - seriesIndex)).toISOString(),
    });
    seed.seasons.forEach(([name, start, end], i) => {
      tables.seasons.push({ id: `${seed.id}-s${i + 1}`, series_id: seed.id, name, start_chapter: start, end_chapter: end });
    });
    seed.episodes.forEach(([number, start, end, duration]) => {
      tables.episodes.push({
        id: `${seed.id}-e${number}`,
        series_id: seed.id,
        episode_number: String(number),
        title: null,
        start_chapter: start,
        end_chapter: end,
        cover_url: null,
        duration: duration ?? null,
      });
    });
    seed.volumes.forEach(([number, start, end, hasCover]) => {
      tables.volumes.push({
        id: `${seed.id}-v${number}`,
        series_id: seed.id,
        volume_number: number,
        start_chapter: start,
        end_chapter: end,
        cover_url: hasCover ? img('volume', `${seed.id}-v${number}`, `${plainTitle} ${number}`, seed.accent) : null,
      });
    });
  });

  return tables;
}
