// src/types/index.ts
// 앱 전역 도메인 타입. DB의 snake_case 행은 lib/api.ts에서 한 번만 변환되고,
// 컴포넌트는 항상 아래의 camelCase 모델만 사용한다.

export interface Series {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  bannerUrl: string | null;
  /** 항상 #rrggbb 로 정규화된 값 */
  accentColor: string;
  youtubeBgmId: string | null;
}

export interface Season {
  id: string;
  name: string;
  startChapter: number;
  /** null = 아직 끝나지 않은 시즌 */
  endChapter: number | null;
}

export interface Episode {
  id: string;
  /** DB에서 text — '1', '7-11', 'OVA', 'Movie' 등 */
  number: string;
  title: string | null;
  startChapter: number;
  endChapter: number;
  coverUrl: string | null;
  /** 분 단위 */
  duration: number | null;
}

export interface Volume {
  id: string;
  number: number;
  startChapter: number;
  endChapter: number;
  coverUrl: string | null;
}

export interface TimelineData {
  series: Series;
  seasons: Season[];
  episodes: Episode[];
  volumes: Volume[];
}

export type MediaKind = 'episode' | 'volume';

/** 랜딩 카드용 요약 — 챕터 순으로 정렬된 id/번호만 담는다. */
export interface SeriesSummary {
  id: string;
  title: string;
  coverUrl: string | null;
  bannerUrl: string | null;
  accentColor: string;
  episodes: Array<Pick<Episode, 'id' | 'number'>>;
  volumes: Array<Pick<Volume, 'id' | 'number'>>;
}

export interface Profile {
  username: string;
  is_approved: boolean;
  role: string;
}

/** seriesId → 완료한 episode/volume id 목록 */
export type CompletedMap = Record<string, string[]>;

// ── Admin 입력 ──────────────────────────────────────────────────────────────
export interface AdminFormData {
  title: string;
  description: string;
  accentColor: string;
  coverUrl: string;
  bannerUrl: string;
  youtubeBgmId: string;
}

export interface AdminJsonInput {
  seasons?: AdminSeasonInput[];
  episodes?: AdminEpisodeInput[];
  volumes?: AdminVolumeInput[];
}

export interface AdminSeasonInput {
  name: string;
  startChapter: number;
  endChapter: number | null;
}

export interface AdminEpisodeInput {
  number: number | string;
  title?: string;
  startChapter: number;
  endChapter: number;
  cover_url?: string;
  coverUrl?: string;
  duration?: number;
}

export interface AdminVolumeInput {
  number: number;
  startChapter: number;
  endChapter: number;
  cover_url?: string;
  coverUrl?: string;
}
