// src/lib/catalog.ts
// 시리즈 카탈로그: repo에 번들된 src/data/series/*.json + 이 기기의 로컬 초안.
//
// - 번들 데이터는 빌드 시 포함되는 공개 데이터다.
// - 초안(draft)은 AdminDashboard에서 만든/편집한 시리즈로 localStorage에만 있다.
//   "시리즈 JSON 내보내기"로 받은 파일을 src/data/series/에 커밋하면 번들이 된다.
// - 같은 id의 초안이 있으면 초안이 우선한다(로컬 편집 미리보기). 커밋 후 초안을 지우면 된다.
import type { SeriesRecord, TimelineData } from '../types';
import { readJson, writeJson, onExternalChange } from './storage';

export const DRAFTS_KEY = 'animan:drafts:v1';
export const DEFAULT_ACCENT = '#03acb1';

const bundledModules = import.meta.glob<SeriesRecord>('../data/series/*.json', {
  eager: true,
  import: 'default',
});

const BUNDLED: SeriesRecord[] = Object.values(bundledModules);
const BUNDLED_IDS = new Set(BUNDLED.map((s) => s.id));

export interface CatalogEntry extends SeriesRecord {
  /** 로컬 초안에서 온 항목인지 */
  isDraft: boolean;
  /** 번들에도 같은 id가 있는 초안(=로컬 수정본)인지 */
  overridesBundled: boolean;
}

// ── 초안 저장소 ──────────────────────────────────────────────────────────────

const isSeriesRecord = (v: unknown): v is SeriesRecord => {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    Array.isArray(r.seasons) &&
    Array.isArray(r.episodes) &&
    Array.isArray(r.volumes)
  );
};

const loadDrafts = (): SeriesRecord[] => {
  const raw = readJson(DRAFTS_KEY);
  return Array.isArray(raw) ? raw.filter(isSeriesRecord) : [];
};

let drafts: SeriesRecord[] = loadDrafts();
let snapshot: CatalogEntry[] = buildSnapshot();
const listeners = new Set<() => void>();

function buildSnapshot(): CatalogEntry[] {
  const draftIds = new Set(drafts.map((d) => d.id));
  const entries: CatalogEntry[] = [
    ...BUNDLED.filter((s) => !draftIds.has(s.id)).map((s) => ({
      ...s,
      isDraft: false,
      overridesBundled: false,
    })),
    ...drafts.map((d) => ({ ...d, isDraft: true, overridesBundled: BUNDLED_IDS.has(d.id) })),
  ];
  // 기존 Supabase 정렬(created_at desc) 유지
  return entries.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

const emit = () => {
  snapshot = buildSnapshot();
  listeners.forEach((l) => l());
};

onExternalChange(DRAFTS_KEY, () => {
  drafts = loadDrafts();
  emit();
});

export const subscribeCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 카탈로그 전체 (created_at 내림차순). 참조는 변경 시에만 바뀐다. */
export const getCatalog = (): CatalogEntry[] => snapshot;

export const getSeries = (seriesId: string): CatalogEntry | undefined =>
  snapshot.find((s) => s.id === seriesId);

export const getDrafts = (): SeriesRecord[] => drafts;

export const saveDraft = (record: SeriesRecord) => {
  drafts = [...drafts.filter((d) => d.id !== record.id), record];
  writeJson(DRAFTS_KEY, drafts);
  emit();
};

export const deleteDraft = (seriesId: string) => {
  drafts = drafts.filter((d) => d.id !== seriesId);
  writeJson(DRAFTS_KEY, drafts);
  emit();
};

/** 테스트용: localStorage에서 초안을 다시 읽는다. */
export const reloadDrafts = () => {
  drafts = loadDrafts();
  emit();
};

// ── 정렬/변환 ────────────────────────────────────────────────────────────────

const byStartChapter = <T extends { start_chapter: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => Number(a.start_chapter) - Number(b.start_chapter));

/** 화면 순서(원작 챕터 오름차순)의 에피소드/권 목록 */
export const orderedItems = (record: SeriesRecord, kind: 'episode' | 'volume') =>
  kind === 'episode' ? byStartChapter(record.episodes) : byStartChapter(record.volumes);

/** 레코드 → 컴포넌트가 쓰는 TimelineData (기존 useTimelineData 매핑과 동일) */
export const toTimelineData = (record: SeriesRecord): TimelineData => ({
  series: {
    id: record.id,
    title: record.title,
    description: record.description,
    cover_url: record.cover_url,
    banner_url: record.banner_url,
    accent_color: record.accent_color ?? DEFAULT_ACCENT,
    youtube_bgm_id: record.youtube_bgm_id,
    created_at: record.created_at,
    coverUrl: record.cover_url,
    bannerUrl: record.banner_url,
    accentColor: record.accent_color ?? DEFAULT_ACCENT,
    youtubeBgmId: record.youtube_bgm_id,
  },
  seasons: byStartChapter(record.seasons).map((s) => ({
    ...s,
    series_id: record.id,
    startChapter: Number(s.start_chapter),
    endChapter: s.end_chapter != null ? Number(s.end_chapter) : null,
  })),
  episodes: byStartChapter(record.episodes).map((e) => ({
    ...e,
    series_id: record.id,
    episode_number: typeof e.episode_number === 'number' ? e.episode_number : undefined,
    number: e.episode_number,
    startChapter: Number(e.start_chapter),
    endChapter: Number(e.end_chapter),
    coverUrl: e.cover_url,
    duration: e.duration != null ? Number(e.duration) : undefined,
  })),
  volumes: byStartChapter(record.volumes).map((v) => ({
    ...v,
    series_id: record.id,
    number: v.volume_number,
    startChapter: Number(v.start_chapter),
    endChapter: Number(v.end_chapter),
    coverUrl: v.cover_url,
  })),
});
