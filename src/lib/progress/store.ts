// src/lib/progress/store.ts
// 진행 기록 저장소 — 이 모듈이 진행 기록을 바꾸는 유일한 경로다.
//
// React와 무관하게 동작하므로 화면 밖(콘솔, 향후 Life Hub 제안 승인 처리 등)에서도
// 그대로 호출할 수 있다. 상태는 localStorage[PROGRESS_KEY]에
// `{ [seriesId]: string[] }` 형태로 저장된다(구 Supabase user_progress.completed_ids와 동일).
import type { ProgressMap } from '../../types';
import { readJson, writeJson, onExternalChange } from '../storage';
import { getSeries, orderedItems } from '../catalog';

export const PROGRESS_KEY = 'animan:progress:v1';

export type ItemKind = 'episode' | 'volume';
export type ImportMode = 'merge' | 'replace';

/** 임의 값을 ProgressMap으로 정규화한다(문자열 아닌 값·중복 제거). 형식이 틀리면 null. */
export const normalizeProgress = (value: unknown): ProgressMap | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: ProgressMap = {};
  for (const [seriesId, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(ids)) return null;
    const clean = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id !== '')));
    if (clean.length > 0) out[seriesId] = clean;
  }
  return out;
};

const load = (): ProgressMap => normalizeProgress(readJson(PROGRESS_KEY)) ?? {};

let state: ProgressMap = load();
const listeners = new Set<() => void>();

const commit = (next: ProgressMap) => {
  state = next;
  writeJson(PROGRESS_KEY, state);
  listeners.forEach((l) => l());
};

const setSeries = (seriesId: string, ids: string[]) => {
  const next = { ...state };
  if (ids.length > 0) next[seriesId] = ids;
  else delete next[seriesId];
  commit(next);
};

onExternalChange(PROGRESS_KEY, () => {
  state = load();
  listeners.forEach((l) => l());
});

// ── 읽기 ─────────────────────────────────────────────────────────────────────

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 전체 진행 기록 스냅샷(불변으로 다룰 것). */
export const getProgress = (): ProgressMap => state;

export const getCompletedIds = (seriesId: string): string[] => state[seriesId] ?? [];

export const isCompleted = (seriesId: string, itemId: string) =>
  getCompletedIds(seriesId).includes(itemId);

// ── 쓰기 ─────────────────────────────────────────────────────────────────────

/** ids를 완료로 표시한다(합집합). 새로 추가된 ID 목록을 반환. */
export const markCompleted = (seriesId: string, ids: string[]): string[] => {
  const current = getCompletedIds(seriesId);
  const set = new Set(current);
  const added = Array.from(new Set(ids)).filter((id) => typeof id === 'string' && id !== '' && !set.has(id));
  if (added.length === 0) return [];
  setSeries(seriesId, [...current, ...added]);
  return added;
};

/** ids를 미완료로 되돌린다. 실제로 제거된 ID 목록을 반환. */
export const unmarkCompleted = (seriesId: string, ids: string[]): string[] => {
  const current = getCompletedIds(seriesId);
  const remove = new Set(ids);
  const removed = current.filter((id) => remove.has(id));
  if (removed.length === 0) return [];
  setSeries(seriesId, current.filter((id) => !remove.has(id)));
  return removed;
};

/** 한 항목을 토글한다. 토글 후 완료 상태를 반환. */
export const toggleCompleted = (seriesId: string, itemId: string): boolean => {
  if (isCompleted(seriesId, itemId)) {
    unmarkCompleted(seriesId, [itemId]);
    return false;
  }
  markCompleted(seriesId, [itemId]);
  return true;
};

/**
 * 원작 챕터 순서 기준으로 `number`번 에피소드/권까지(포함) 모두 완료로 표시한다.
 * (타임라인 "우클릭 = 여기까지 완료"와 같은 동작)
 * 시리즈나 번호를 찾지 못하면 Error를 던진다. 새로 추가된 ID 목록을 반환.
 */
export const markUpTo = (seriesId: string, kind: ItemKind, number: number | string): string[] => {
  const series = getSeries(seriesId);
  if (!series) throw new Error(`알 수 없는 시리즈: ${seriesId}`);
  const items = orderedItems(series, kind);
  const target = String(number);
  const index = items.findIndex((item) =>
    String('episode_number' in item ? item.episode_number : item.volume_number) === target
  );
  if (index === -1) throw new Error(`${kind} ${target}을(를) 찾을 수 없습니다 (${series.title})`);
  return markCompleted(seriesId, items.slice(0, index + 1).map((item) => item.id));
};

/** 진행 기록을 들여온다. merge = 시리즈별 합집합, replace = 전체 교체. */
export const importProgress = (incoming: ProgressMap, mode: ImportMode = 'merge') => {
  commit(mergeProgress(state, incoming, mode));
};

/** 순수 함수: 두 진행 기록을 합친다. merge는 기존 순서를 유지하고 새 ID를 뒤에 붙인다. */
export const mergeProgress = (
  current: ProgressMap,
  incoming: ProgressMap,
  mode: ImportMode
): ProgressMap => {
  const clean = normalizeProgress(incoming) ?? {};
  if (mode === 'replace') return clean;
  const out: ProgressMap = { ...current };
  for (const [seriesId, ids] of Object.entries(clean)) {
    const existing = out[seriesId] ?? [];
    const set = new Set(existing);
    out[seriesId] = [...existing, ...ids.filter((id) => !set.has(id))];
  }
  return out;
};

/** 테스트용: localStorage에서 다시 읽는다. */
export const reloadProgress = () => {
  state = load();
  listeners.forEach((l) => l());
};
