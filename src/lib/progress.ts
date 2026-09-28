// src/lib/progress.ts
// 진도 계산과 라벨 포맷 — Hero, 소셜 카드, 타임라인, 랜딩이 같은 규칙을 쓰도록 한 곳에 모은다.
import type { Episode, Volume } from '../types';

export interface TrackStat {
  done: number;
  total: number;
  /** 0~100, 반올림 전 값 */
  percent: number;
}

export interface ProgressSummary {
  episodes: TrackStat;
  volumes: TrackStat;
  watchedMinutes: number;
  nextEpisode: Pick<Episode, 'id' | 'number'> | null;
  nextVolume: Pick<Volume, 'id' | 'number'> | null;
}

function track(items: Array<{ id: string }>, completed: ReadonlySet<string>): TrackStat {
  const done = items.reduce((n, item) => n + (completed.has(item.id) ? 1 : 0), 0);
  return { done, total: items.length, percent: items.length ? (done / items.length) * 100 : 0 };
}

export function summarizeProgress(
  data: {
    episodes: Array<Pick<Episode, 'id' | 'number'> & { duration?: number | null }>;
    volumes: Array<Pick<Volume, 'id' | 'number'>>;
  },
  completedIds: readonly string[],
): ProgressSummary {
  const completed = new Set(completedIds);
  return {
    episodes: track(data.episodes, completed),
    volumes: track(data.volumes, completed),
    watchedMinutes: data.episodes.reduce(
      (sum, ep) => sum + (completed.has(ep.id) ? Number(ep.duration) || 0 : 0),
      0,
    ),
    nextEpisode: data.episodes.find((ep) => !completed.has(ep.id)) ?? null,
    nextVolume: data.volumes.find((vol) => !completed.has(vol.id)) ?? null,
  };
}

/** '12' → 'Ep 12', '7-11' → 'Ep 7-11', 'OVA'·'Movie' → 그대로 */
export function episodeLabel(number: string | number): string {
  const text = String(number).trim();
  return /^\d+([-~]\d+)?$/.test(text) ? `Ep ${text}` : text;
}

export const volumeLabel = (number: number | string) => `Vol ${number}`;

export function chapterRangeLabel(start: number, end: number | null): string {
  if (end == null) return `Ch ${start}–`;
  return start === end ? `Ch ${start}` : `Ch ${start}–${end}`;
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

/** 목록에서 targetId까지(포함) 모든 id — "여기까지 모두 완료"용 */
export function idsUpTo(items: ReadonlyArray<{ id: string }>, targetId: string): string[] {
  const index = items.findIndex((item) => item.id === targetId);
  return index === -1 ? [] : items.slice(0, index + 1).map((item) => item.id);
}
