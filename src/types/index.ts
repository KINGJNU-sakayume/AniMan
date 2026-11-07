// src/types/index.ts
// 전체 앱에서 사용되는 공통 타입 정의 (M-01: any 남발 해소)

export interface Series {
  id: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  banner_url?: string | null;
  accent_color?: string;
  youtube_bgm_id?: string | null;
  created_at?: string;
  // mockData 호환성 (banner_image_url 필드)
  banner_image_url?: string | null;
  // 호환성을 위한 camelCase 별칭 (useTimelineData에서 매핑)
  coverUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string;
  youtubeBgmId?: string | null;
}

export interface Season {
  id?: string;
  series_id?: string;
  name: string;
  start_chapter?: number;
  end_chapter?: number | null;
  // camelCase 별칭
  startChapter: number;
  endChapter: number | null;
}

export interface Episode {
  id: string;
  series_id?: string;
  episode_number?: number;
  title?: string | null;
  start_chapter?: number;
  end_chapter?: number;
  cover_url?: string | null;
  duration?: number | null;
  // camelCase 별칭
  number: number | string;
  startChapter: number;
  endChapter: number;
  coverUrl?: string | null;
}

export interface Volume {
  id: string;
  series_id?: string;
  volume_number?: number;
  start_chapter?: number;
  end_chapter?: number;
  cover_url?: string | null;
  // camelCase 별칭
  number: number;
  startChapter: number;
  endChapter: number;
  coverUrl?: string | null;
}

export interface TimelineData {
  series: Series;
  seasons: Season[];
  episodes: Episode[];
  volumes: Volume[];
}

export interface SeriesListOption {
  id: string;
  title: string;
}

// Admin 폼용 타입
export interface AdminFormData {
  title: string;
  description: string;
  accentColor: string;
  coverUrl: string;
  bannerUrl: string;
  youtubeBgmId: string;
}

// Admin JSON input 타입
export interface AdminJsonInput {
  seasons?: AdminSeasonInput[];
  episodes?: AdminEpisodeInput[];
  volumes?: AdminVolumeInput[];
}

export interface AdminSeasonInput {
  /** 기존 항목 편집 시 ID 유지용. 없으면 새 UUID를 만든다. */
  id?: string;
  name: string;
  startChapter: number;
  endChapter: number | null;
}

export interface AdminEpisodeInput {
  /** 기존 항목 편집 시 ID 유지용. 없으면 새 UUID를 만든다. */
  id?: string;
  number: number | string;
  title?: string;
  startChapter: number;
  endChapter: number;
  cover_url?: string;
  coverUrl?: string;
  duration?: number;
}

export interface AdminVolumeInput {
  /** 기존 항목 편집 시 ID 유지용. 없으면 새 UUID를 만든다. */
  id?: string;
  number: number;
  startChapter: number;
  endChapter: number;
  cover_url?: string;
  coverUrl?: string;
}

// Timeline 내부 처리용 타입 (actualStart/End 포함)
export interface ProcessedItem {
  id: string;
  number: number | string;
  title?: string | null;
  startChapter: number;
  endChapter: number | null;
  duration?: number | null;
  cover_url?: string | null;
  coverUrl?: string | null;
  actualStart: number;
  actualEnd: number;
}

export interface ProcessedSeason {
  id?: string;
  name: string;
  startChapter: number;
  endChapter: number | null;
  actualStart: number;
  actualEnd: number;
}

// ── 번들 카탈로그(src/data/series/*.json) 레코드 ─────────────────────────────
// Supabase 테이블 컬럼명을 그대로 사용한다(snake_case). id는 기존 UUID를 유지해야
// 진행 기록(completed_ids)이 그대로 맞는다.

export interface SeasonRecord {
  id: string;
  name: string;
  start_chapter: number;
  end_chapter: number | null;
}

export interface EpisodeRecord {
  id: string;
  episode_number: string | number;
  title: string | null;
  start_chapter: number;
  end_chapter: number;
  cover_url: string | null;
  duration: number | null;
}

export interface VolumeRecord {
  id: string;
  volume_number: number;
  start_chapter: number;
  end_chapter: number;
  cover_url: string | null;
}

export interface SeriesRecord {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  banner_url: string | null;
  accent_color: string;
  youtube_bgm_id: string | null;
  created_at: string;
  /** TMDB 항목(scripts/fill-tmdb.mjs 가 채운다). 보드 타일의 표지 주소를 만드는 데만 쓴다. */
  tmdb_id?: number | null;
  tmdb_media_type?: 'tv' | 'movie' | null;
  tmdb_poster_path?: string | null;
  seasons: SeasonRecord[];
  episodes: EpisodeRecord[];
  volumes: VolumeRecord[];
}

/** 진행 기록: 시리즈 ID → 완료한 에피소드/권 ID 목록 */
export type ProgressMap = Record<string, string[]>;
