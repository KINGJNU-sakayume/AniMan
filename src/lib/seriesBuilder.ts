// src/lib/seriesBuilder.ts
// AdminDashboard 입력(폼 + JSON) ↔ 카탈로그 레코드 변환.
import type {
  AdminFormData,
  AdminJsonInput,
  SeriesRecord,
} from '../types';
import { DEFAULT_ACCENT } from './catalog';

const newUuid = () => crypto.randomUUID();

const toNum = (value: unknown, field: string): number => {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) {
    throw new Error(`${field} 값이 숫자가 아닙니다: ${JSON.stringify(value)}`);
  }
  return n;
};

const textOrNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

export interface BuildOptions {
  /** 편집 중인 기존 시리즈 ID (없으면 새 UUID) */
  id?: string;
  createdAt?: string;
  makeId?: () => string;
  now?: Date;
}

/** 폼 + JSON 입력으로 시리즈 레코드를 만든다. 항목 id가 있으면 그대로 유지한다. */
export const buildSeriesRecord = (
  form: AdminFormData,
  json: AdminJsonInput,
  opts: BuildOptions = {}
): SeriesRecord => {
  const makeId = opts.makeId ?? newUuid;
  const title = form.title.trim();
  if (!title) throw new Error('작품 제목(Series Title)은 필수입니다.');
  if (!json || typeof json !== 'object') throw new Error('JSON 입력이 객체가 아닙니다.');
  for (const key of ['seasons', 'episodes', 'volumes'] as const) {
    if (json[key] !== undefined && !Array.isArray(json[key])) {
      throw new Error(`"${key}"는 배열이어야 합니다.`);
    }
  }

  const record: SeriesRecord = {
    id: opts.id ?? makeId(),
    title,
    description: textOrNull(form.description),
    cover_url: textOrNull(form.coverUrl),
    banner_url: textOrNull(form.bannerUrl),
    accent_color: textOrNull(form.accentColor) ?? DEFAULT_ACCENT,
    youtube_bgm_id: textOrNull(form.youtubeBgmId),
    created_at: opts.createdAt ?? (opts.now ?? new Date()).toISOString(),
    seasons: (json.seasons ?? []).map((s, i) => ({
      id: s.id ?? makeId(),
      name: String(s.name ?? '').trim() || `Season ${i + 1}`,
      start_chapter: toNum(s.startChapter, `seasons[${i}].startChapter`),
      end_chapter: s.endChapter == null ? null : toNum(s.endChapter, `seasons[${i}].endChapter`),
    })),
    episodes: (json.episodes ?? []).map((e, i) => ({
      id: e.id ?? makeId(),
      episode_number: String(e.number ?? i + 1),
      title: textOrNull(e.title),
      start_chapter: toNum(e.startChapter, `episodes[${i}].startChapter`),
      end_chapter: toNum(e.endChapter, `episodes[${i}].endChapter`),
      cover_url: textOrNull(e.coverUrl ?? e.cover_url),
      duration: e.duration == null ? null : toNum(e.duration, `episodes[${i}].duration`),
    })),
    volumes: (json.volumes ?? []).map((v, i) => ({
      id: v.id ?? makeId(),
      volume_number: toNum(v.number ?? i + 1, `volumes[${i}].number`),
      start_chapter: toNum(v.startChapter, `volumes[${i}].startChapter`),
      end_chapter: toNum(v.endChapter, `volumes[${i}].endChapter`),
      cover_url: textOrNull(v.coverUrl ?? v.cover_url),
    })),
  };

  const ids = [record.id, ...record.seasons, ...record.episodes, ...record.volumes].map((x) =>
    typeof x === 'string' ? x : x.id
  );
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`중복된 id가 있습니다: ${dup}`);
  const epNums = record.episodes.map((e) => String(e.episode_number));
  const dupEp = epNums.find((n, i) => epNums.indexOf(n) !== i);
  if (dupEp) throw new Error(`중복된 에피소드 번호: ${dupEp}`);
  const volNums = record.volumes.map((v) => v.volume_number);
  const dupVol = volNums.find((n, i) => volNums.indexOf(n) !== i);
  if (dupVol !== undefined) throw new Error(`중복된 권 번호: ${dupVol}`);

  return record;
};

/** 레코드 → AdminDashboard 입력값(편집용). id를 포함해 다시 저장해도 ID가 유지된다. */
export const recordToAdminInput = (
  record: SeriesRecord
): { form: AdminFormData; json: AdminJsonInput } => ({
  form: {
    title: record.title,
    description: record.description ?? '',
    accentColor: record.accent_color ?? DEFAULT_ACCENT,
    coverUrl: record.cover_url ?? '',
    bannerUrl: record.banner_url ?? '',
    youtubeBgmId: record.youtube_bgm_id ?? '',
  },
  json: {
    seasons: record.seasons.map((s) => ({
      id: s.id,
      name: s.name,
      startChapter: s.start_chapter,
      endChapter: s.end_chapter,
    })),
    episodes: record.episodes.map((e) => ({
      id: e.id,
      number: e.episode_number,
      ...(e.title ? { title: e.title } : {}),
      startChapter: e.start_chapter,
      endChapter: e.end_chapter,
      ...(e.cover_url ? { coverUrl: e.cover_url } : {}),
      ...(e.duration != null ? { duration: e.duration } : {}),
    })),
    volumes: record.volumes.map((v) => ({
      id: v.id,
      number: v.volume_number,
      startChapter: v.start_chapter,
      endChapter: v.end_chapter,
      ...(v.cover_url ? { coverUrl: v.cover_url } : {}),
    })),
  },
});

/** 커밋용 파일 이름 (src/data/series/<id>.json) */
export const seriesFileName = (record: SeriesRecord) => `${record.id}.json`;
