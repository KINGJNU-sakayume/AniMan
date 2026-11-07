// src/lib/board/tiles.ts
// Life Board(보드)로 보낼 타일 목록(manifest v1)을 앱 상태에서 만든다 — 순수 함수만 둔다.
//
// 규격: board 저장소 docs/TILES.md, 검증: js/schema.js(테스트에 복사해 둠), 허용 출처: js/config.js.
// 네트워크·저장소·시계·무작위에 의존하지 않는다: 같은 입력(진행 기록, 카탈로그, now)이면 항상 같은 출력이다
// (그래야 내용 해시 비교로 중복 전송을 막을 수 있다). 이 모듈은 동기화 코드(lifehub/sync*)와 섞지 않는다.
import type { SeriesRecord } from '../../types';
import { EPOCH_AT, type ProgressV2 } from '../progress/model';

/** 보드가 누르면 여는 앱 주소(보드 linkOrigins 안이어야 한다). */
export const BOARD_HREF = 'https://kingjnu-sakayume.github.io/animan/';
/** 허용 출처는 image.tmdb.org (board js/config.js imageOrigins). */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';
/** sleeve(2:3, 400×600 이상)용과 strip·행 썸네일(300px 안팎)용 TMDB 크기. */
export const POSTER_SIZE_SLEEVE = 'w780';
export const POSTER_SIZE_THUMB = 'w342';

/** board js/schema.js 의 최대 길이(글자 수는 JS `.length`). */
export const MAX = { mono: 2, pill: 20, rowValue: 24, name: 30, text: 80, long: 160 } as const;

export const TILE_IDS = { now: 'now', done: 'done', next: 'next' } as const;

export interface BoardCover { src?: string; alt?: string; mono?: string }
export interface BoardProgress { value: number; max: number; text?: string }
export interface BoardRow {
  title: string; value?: string; sub?: string; cover?: BoardCover; progress?: BoardProgress; now?: boolean; muted?: boolean;
}
export interface BoardTile {
  id: string;
  name: string;
  tone: 'sleeve' | 'strip' | 'type';
  form?: 'list';
  sizes: string[];
  size: string;
  default: boolean;
  href: string;
  accent?: { h: number; s: number };
  detail?: { title: string; rows: BoardRow[] };
  data: Record<string, unknown>;
}
export interface BoardManifest {
  version: 1;
  app: 'animan';
  generated_at: string;
  tiles: BoardTile[];
}

/** 글자를 max 자로 자르고(넘치면 …), 앞뒤 공백을 걷는다. 비면 undefined(빈 글자는 타일째 거절되므로 필드를 뺀다). */
export function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1); // 서로게이트 쌍 한가운데를 자르지 않는다
  cut = cut.trimEnd();
  return cut ? `${cut}…` : undefined;
}

/** 첫 글자(코드 포인트 기준) 하나. mono 는 최대 2자라 한 글자만 쓴다. */
export const firstChar = (title: string): string | undefined => {
  const c = Array.from(title.trim())[0];
  return c && c.length <= MAX.mono ? c : undefined;
};

/** `#rgb` `#rrggbb` `#rrggbbaa` → 보드 포인트색 {h: 0~360, s: 0~1}. 해석하지 못하면 undefined. */
export function hexToAccent(hex: unknown): { h: number; s: number } | undefined {
  if (typeof hex !== 'string') return undefined;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return undefined;
  let h = m[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(hue) % 361, s: Math.round(Math.min(1, Math.max(0, sat)) * 100) / 100 };
}

const POSTER_PATH = /^\/[A-Za-z0-9_-]{1,100}\.(?:jpg|jpeg|png|webp)$/;
/** TMDB 포스터 주소. 경로가 없거나 이상하면 undefined(글자 칸으로 대신한다). */
export const posterUrl = (series: Pick<SeriesRecord, 'tmdb_poster_path'>, size: string): string | undefined => {
  const path = series.tmdb_poster_path;
  return typeof path === 'string' && POSTER_PATH.test(path) ? `${TMDB_IMAGE_BASE}${size}${path}` : undefined;
};

const pad = (n: number) => String(n);
/** `11/5`, 해가 `now` 와 다르면 `2025/11/5`(로컬 날짜). */
export function dateLabel(atMs: number, nowMs: number): string {
  const d = new Date(atMs);
  const n = new Date(nowMs);
  const md = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return d.getFullYear() === n.getFullYear() ? md : `${d.getFullYear()}/${md}`;
}

const episodeLabel = (n: string | number): string => {
  const s = String(n).trim();
  return /^\d+(?:\.\d+)?$/.test(s) ? `${s}화` : s;
};

interface SeriesStat {
  series: SeriesRecord;
  total: number;
  done: number;
  /** 완료한 에피소드 중 가장 늦은 at(ms). v1 에서 변환된 기록만 있으면 EPOCH. */
  lastMs: number;
  dated: boolean;
  /** 가장 늦게 체크한 에피소드(같은 at 이면 원작 챕터가 뒤인 쪽) */
  last: SeriesRecord['episodes'][number];
  /** 화면 순서(원작 챕터 오름차순)에서 처음으로 아직 안 한 에피소드 */
  next: SeriesRecord['episodes'][number] | undefined;
}

const byChapter = (a: { start_chapter: number }, b: { start_chapter: number }) => Number(a.start_chapter) - Number(b.start_chapter);
const epochMs = Date.parse(EPOCH_AT);

/** 에피소드를 하나라도 완료한 작품의 통계. 기록이 없거나 에피소드가 없는 작품은 뺀다. */
function collect(progress: ProgressV2, catalog: SeriesRecord[]): SeriesStat[] {
  const out: SeriesStat[] = [];
  for (const series of catalog) {
    const items = progress[series.id];
    if (!items || series.episodes.length === 0) continue;
    const ordered = [...series.episodes].sort(byChapter);
    let done = 0;
    let lastMs = -Infinity;
    let last: SeriesStat['last'] | undefined;
    let next: SeriesStat['next'];
    for (const ep of ordered) {
      const entry = items[ep.id];
      if (entry?.done) {
        done++;
        const ms = Date.parse(entry.at);
        const at = Number.isFinite(ms) ? ms : epochMs;
        if (at >= lastMs) {
          lastMs = at;
          last = ep;
        }
      } else if (!next) next = ep;
    }
    if (done === 0 || !last) continue;
    out.push({ series, total: ordered.length, done, lastMs, dated: lastMs > epochMs, last, next });
  }
  // 가장 최근 순. 같으면 제목, id 순으로 고정해 같은 입력이 늘 같은 순서가 되게 한다.
  return out.sort((a, b) => b.lastMs - a.lastMs || a.series.title.localeCompare(b.series.title) || (a.series.id < b.series.id ? -1 : 1));
}

const seasonLabel = (series: SeriesRecord, ep: SeriesStat['last']): string | undefined => {
  if (series.seasons.length < 2) return undefined;
  const seasons = [...series.seasons].sort(byChapter);
  const i = seasons.findIndex((s) => ep.start_chapter >= s.start_chapter && (s.end_chapter == null || ep.start_chapter <= s.end_chapter));
  return i >= 0 ? `시즌 ${i + 1}` : undefined;
};

const progressOf = (s: SeriesStat): BoardProgress => ({ value: s.done, max: s.total, text: `${s.done} / ${s.total}화` });
const complete = (s: SeriesStat) => s.done >= s.total;

function thumb(s: SeriesStat): BoardCover | undefined {
  const src = posterUrl(s.series, POSTER_SIZE_THUMB);
  return src ? { src, alt: '' } : undefined;
}

function watchedText(s: SeriesStat, nowMs: number): string | undefined {
  if (!s.dated) return undefined;
  return `${dateLabel(s.lastMs, nowMs)} ${complete(s) ? '완주' : '이어 봄'}`;
}

/** 값이 undefined 인 필드를 뺀다(보드는 빈 값이 아니라 없는 필드를 기대한다). */
const compact = <T extends Record<string, unknown>>(o: T): T => {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
};

function recentRow(s: SeriesStat, nowMs: number, first: boolean): BoardRow {
  const cover = thumb(s);
  return compact({
    title: clip(s.series.title, MAX.text) ?? '제목 없음',
    value: clip(`${s.done}/${s.total}화`, MAX.rowValue),
    sub: clip(watchedText(s, nowMs), MAX.long),
    cover,
    progress: progressOf(s),
    now: first && !complete(s) ? true : undefined,
    muted: complete(s) ? true : undefined,
  });
}

function nowTile(stats: SeriesStat[], nowMs: number): BoardTile | null {
  const top = stats[0];
  if (!top) return null;
  const title = clip(top.series.title, MAX.text) ?? '제목 없음';
  const poster = posterUrl(top.series, POSTER_SIZE_SLEEVE);
  const cover: BoardCover = poster ? { src: poster, alt: '' } : { mono: firstChar(title) ?? '·' };
  const last = top.last;
  const sub = [
    seasonLabel(top.series, last),
    episodeLabel(last.episode_number),
    last.title,
  ].map((x) => (typeof x === 'string' ? x.trim() : x)).filter((x) => x).join(' · ');
  const rows = stats.slice(0, 5).map((s, i) => recentRow(s, nowMs, i === 0));
  return {
    id: TILE_IDS.now,
    name: 'AniMan · 정주행 중',
    tone: 'sleeve',
    sizes: ['1x1', '2x1', '2x2', '4x2'],
    size: '2x2',
    default: true,
    href: BOARD_HREF,
    ...compact({ accent: hexToAccent(top.series.accent_color) }),
    detail: { title: `AniMan · 최근 정주행 ${rows.length}개`, rows },
    data: compact({
      label: 'AniMan',
      title,
      cover,
      sub: clip(sub, MAX.long),
      pill: clip(watchedText(top, nowMs), MAX.pill),
      progress: progressOf(top),
      list: stats.slice(0, 4).map((s, i) => recentRow(s, nowMs, i === 0)),
      listLabel: '최근 정주행',
    }),
  };
}

function doneTile(stats: SeriesStat[]): BoardTile | null {
  const finished = stats.filter(complete).slice(0, 8);
  if (finished.length === 0) return null;
  return {
    id: TILE_IDS.done,
    name: 'AniMan · 최근 완주',
    tone: 'strip',
    sizes: ['2x1', '4x1'],
    size: '4x1',
    default: true,
    href: BOARD_HREF,
    ...compact({ accent: hexToAccent(finished[0].series.accent_color) }),
    data: {
      label: '최근 완주',
      items: finished.map((s) => {
        const cover = thumb(s);
        return { title: clip(s.series.title, MAX.text) ?? '제목 없음', ...(cover ? { cover } : {}) };
      }),
    },
  };
}

function nextTile(stats: SeriesStat[], nowMs: number): BoardTile | null {
  const open = stats.filter((s) => !complete(s)).slice(0, 6);
  if (open.length === 0) return null;
  const rows: BoardRow[] = open.map((s) => compact({
    title: clip(s.series.title, MAX.text) ?? '제목 없음',
    value: s.next ? clip(episodeLabel(s.next.episode_number), MAX.rowValue) : undefined,
    sub: clip(watchedText(s, nowMs), MAX.long),
    cover: thumb(s),
  }));
  const top = open[0];
  return {
    id: TILE_IDS.next,
    name: 'AniMan · 이어 볼 차례',
    tone: 'type',
    form: 'list',
    sizes: ['2x1', '2x2'],
    size: '2x2',
    default: false,
    href: BOARD_HREF,
    ...compact({ accent: hexToAccent(top.series.accent_color) }),
    data: compact({
      label: '이어 볼 차례',
      rows,
      foot: top.dated ? `마지막 시청 ${dateLabel(top.lastMs, nowMs)}` : undefined,
    }),
  };
}

/**
 * 진행 기록(`getProgressV2()`)과 카탈로그(`getCatalog()`)로 보드 목록을 만든다. `now`(ms 또는 Date)는 날짜 표기(연도)와
 * `generated_at` 에만 쓴다. 에피소드 기록이 없으면 타일이 0개인 목록이 된다.
 */
export function buildBoardTiles(progress: ProgressV2, catalog: SeriesRecord[], now: number | Date): BoardManifest {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const stats = collect(progress, catalog);
  const tiles = [nowTile(stats, nowMs), doneTile(stats), nextTile(stats, nowMs)].filter((t): t is BoardTile => t !== null);
  return { version: 1, app: 'animan', generated_at: new Date(nowMs).toISOString(), tiles };
}

/** 이 앱에 완료 기록이 하나라도 있는가(없으면 업로드하지 않는다: 새 기기가 빈 목록으로 덮지 않게). */
export const hasAnyRecord = (progress: ProgressV2): boolean =>
  Object.values(progress).some((items) => Object.values(items).some((e) => e.done));
