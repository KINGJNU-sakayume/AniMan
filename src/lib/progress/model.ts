// src/lib/progress/model.ts
// 진행 기록 v2 데이터 모델 — 순수 함수만 둔다(저장소·시계·네트워크에 의존하지 않음).
//
// v2: { [작품 id]: { [에피소드/권 id]: { done: boolean, at: ISO 시각 } } }
//  - done:false 는 "체크 해제" 묘비(tombstone). 다른 기기로 해제가 전달되려면 흔적이 남아야 한다.
//  - 항목마다 at 이 더 늦은 쪽이 이긴다(merge.ts).
// 형식의 근거: life-hub docs/P6_SYNC.md 6절(animan).
import type { ProgressMap } from '../../types';

export interface ItemEntry {
  done: boolean;
  /** 정규화된 ISO 8601 (`Date.prototype.toISOString()` 형식) */
  at: string;
}
export type ProgressV2 = Record<string, Record<string, ItemEntry>>;

export interface ProgressDocV2 {
  app: 'animan';
  version: 2;
  exportedAt: string;
  progress: ProgressV2;
}

/** v1 로컬 데이터를 변환할 때 쓰는 고정 시각(Unix epoch). 어떤 실제 체크/해제도 이것을 이긴다. */
export const EPOCH_AT = '1970-01-01T00:00:00.000Z';
/** 묘비 보관 기간. 이보다 오래된 done:false 는 *쓸 때만* 지운다. */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** 프로토타입 오염 방지: 이 키는 항목/작품 id 로 받지 않는다. */
const badKey = (k: string) => k === '' || k === '__proto__';

/** at 문자열의 epoch ms. ISO 날짜로 시작하지 않거나 Date.parse 가 실패하면 null. */
export const parseAt = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  // toISOString 이 던지지 않는 범위만 받는다.
  return Math.abs(ms) <= 8.64e15 ? ms : null;
};

export const isoOf = (ms: number): string => new Date(ms).toISOString();

/** 임의 값을 v2 진행 기록으로 정규화한다. 객체가 아니면 null. 해석 못 하는 항목은 버린다. */
export const normalizeV2 = (value: unknown): ProgressV2 | null => {
  if (!isObject(value)) return null;
  const out: ProgressV2 = {};
  for (const [seriesId, items] of Object.entries(value)) {
    if (badKey(seriesId) || !isObject(items)) continue;
    const clean: Record<string, ItemEntry> = {};
    for (const [itemId, entry] of Object.entries(items)) {
      if (badKey(itemId) || !isObject(entry) || typeof entry.done !== 'boolean') continue;
      const ms = parseAt(entry.at);
      if (ms === null) continue;
      clean[itemId] = { done: entry.done, at: isoOf(ms) };
    }
    if (Object.keys(clean).length > 0) out[seriesId] = clean;
  }
  return out;
};

/** 임의 값을 v1 모양({ [seriesId]: string[] })으로 정규화한다(문자열 아닌 값·중복 제거). 형식이 틀리면 null. */
export const normalizeProgress = (value: unknown): ProgressMap | null => {
  if (!isObject(value)) return null;
  const out: ProgressMap = {};
  for (const [seriesId, ids] of Object.entries(value)) {
    if (!Array.isArray(ids)) return null;
    const clean = Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && !badKey(id))));
    if (clean.length > 0 && !badKey(seriesId)) out[seriesId] = clean;
  }
  return out;
};

/** 완료 목록을 v2 로 바꾼다: 모든 id 가 done:true, at 은 고정 시각. */
export const fromV1 = (map: ProgressMap, at: string = EPOCH_AT): ProgressV2 => {
  const out: ProgressV2 = {};
  for (const [seriesId, ids] of Object.entries(map)) {
    if (badKey(seriesId)) continue;
    const items: Record<string, ItemEntry> = {};
    for (const id of ids) if (!badKey(id)) items[id] = { done: true, at };
    if (Object.keys(items).length > 0) out[seriesId] = items;
  }
  return out;
};

/** 화면·훅이 쓰는 모양으로 파생한다: 작품 id → 완료한 id 목록(삽입 순서). 비는 작품은 뺀다. */
export const completedMap = (progress: ProgressV2): ProgressMap => {
  const out: ProgressMap = {};
  for (const [seriesId, items] of Object.entries(progress)) {
    const ids = Object.keys(items).filter((id) => items[id].done);
    if (ids.length > 0) out[seriesId] = ids;
  }
  return out;
};

/** done:false 묘비 중 now 기준 180일을 넘은 것을 뺀 새 객체. *쓰기 직전*에만 부른다(병합 안에서는 부르지 않는다). */
export const pruneTombstones = (progress: ProgressV2, nowMs: number): ProgressV2 => {
  const out: ProgressV2 = {};
  for (const [seriesId, items] of Object.entries(progress)) {
    const kept: Record<string, ItemEntry> = {};
    for (const [itemId, entry] of Object.entries(items)) {
      const ms = parseAt(entry.at);
      if (!entry.done && ms !== null && nowMs - ms > TOMBSTONE_TTL_MS) continue;
      kept[itemId] = entry;
    }
    if (Object.keys(kept).length > 0) out[seriesId] = kept;
  }
  return out;
};

/** 키 순서와 무관한 정규 JSON(같은 내용이면 같은 문자열). 동기화 변경 감지와 비교에 쓴다. */
export const canonicalJson = (progress: ProgressV2): string => {
  const sorted: Record<string, Record<string, ItemEntry>> = {};
  for (const seriesId of Object.keys(progress).sort()) {
    const items: Record<string, ItemEntry> = {};
    for (const itemId of Object.keys(progress[seriesId]).sort()) {
      const { done, at } = progress[seriesId][itemId];
      items[itemId] = { done, at };
    }
    sorted[seriesId] = items;
  }
  return JSON.stringify(sorted);
};

export const sameProgress = (a: ProgressV2, b: ProgressV2) => canonicalJson(a) === canonicalJson(b);

/** 가장 늦은 at(ms). 비어 있으면 0. */
export const latestAt = (progress: ProgressV2): number => {
  let max = 0;
  for (const items of Object.values(progress))
    for (const entry of Object.values(items)) max = Math.max(max, parseAt(entry.at) ?? 0);
  return max;
};

/**
 * 한 항목에 찍을 새 시각. baseMs 이상이면서 기존 항목의 at 보다 반드시 늦다
 * (시계가 어긋난 다른 기기가 미래 시각을 남겼어도 이번 조작이 지지 않게).
 */
export const nextAt = (baseMs: number, existing?: ItemEntry): string => {
  const prev = existing ? parseAt(existing.at) : null;
  return isoOf(Math.max(baseMs, prev === null ? baseMs : prev + 1));
};

const clone = (p: ProgressV2): ProgressV2 => {
  const out: ProgressV2 = {};
  for (const [s, items] of Object.entries(p)) out[s] = { ...items };
  return out;
};

/**
 * ids 를 done 으로 바꾼 새 진행 기록과, 실제로 바뀐 id 목록.
 * 이미 그 상태인 항목은 건드리지 않는다(시각도 그대로). 해제는 묘비(done:false)로 남긴다.
 */
export const setDone = (
  progress: ProgressV2,
  seriesId: string,
  ids: string[],
  done: boolean,
  baseMs: number
): { next: ProgressV2; changed: string[] } => {
  const current = progress[seriesId] ?? {};
  const changed: string[] = [];
  const items = { ...current };
  for (const id of new Set(ids)) {
    if (typeof id !== 'string' || badKey(id)) continue;
    const existing = current[id];
    // 이미 그 상태면 건드리지 않는다. (한 번도 체크된 적 없는 항목을 해제할 때도 묘비를 만들지 않는다.)
    if ((existing?.done ?? false) === done) continue;
    items[id] = { done, at: nextAt(baseMs, existing) };
    changed.push(id);
  }
  if (changed.length === 0) return { next: progress, changed };
  return { next: { ...progress, [seriesId]: items }, changed };
};

/**
 * "덮어쓰기": 완료 집합이 target 과 같아지게 한다.
 * target 에 없는 완료 항목은 묘비가 되고(다음 동기화에서 되살아나지 않게), target 에만 있는 항목은 새로 완료된다.
 * 이미 완료인 항목은 그대로 둔다. 묘비/목록에 없던 target 항목은 baseMs 로 찍는다.
 */
export const replaceCompleted = (progress: ProgressV2, target: ProgressMap, baseMs: number): ProgressV2 => {
  const out = clone(progress);
  const wanted = new Map<string, Set<string>>();
  for (const [seriesId, ids] of Object.entries(target))
    if (!badKey(seriesId)) wanted.set(seriesId, new Set(ids.filter((id) => !badKey(id))));
  for (const [seriesId, items] of Object.entries(out)) {
    const keep = wanted.get(seriesId) ?? new Set<string>();
    for (const [id, entry] of Object.entries(items))
      if (entry.done && !keep.has(id)) items[id] = { done: false, at: nextAt(baseMs, entry) };
  }
  for (const [seriesId, ids] of wanted) {
    for (const id of ids) {
      const existing = out[seriesId]?.[id];
      if (existing?.done) continue;
      (out[seriesId] ??= {})[id] = { done: true, at: nextAt(baseMs, existing) };
    }
  }
  for (const seriesId of Object.keys(out)) if (Object.keys(out[seriesId]).length === 0) delete out[seriesId];
  return out;
};

/** 백업/동기화 문서(v2)를 만든다. */
export const makeDocV2 = (progress: ProgressV2, now: Date): ProgressDocV2 => ({
  app: 'animan',
  version: 2,
  exportedAt: now.toISOString(),
  progress,
});

/** 알 수 없는 값이 v2 문서인지 확인하고 정규화한 진행 기록을 돌려준다. 아니면 null. */
export const progressOfDocV2 = (value: unknown): ProgressV2 | null => {
  if (!isObject(value) || value.app !== 'animan' || value.version !== 2) return null;
  return normalizeV2(value.progress);
};
