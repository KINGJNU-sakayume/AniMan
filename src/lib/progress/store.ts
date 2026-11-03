// src/lib/progress/store.ts
// 진행 기록 저장소 — 이 모듈이 진행 기록을 바꾸는 유일한 경로다.
//
// React와 무관하게 동작하므로 화면 밖(콘솔, Life Hub 제안 승인 처리, 기기 동기화)에서도 그대로 호출할 수 있다.
//
// 저장 형식(v2): localStorage[PROGRESS_KEY] = { app:'animan', version:2, exportedAt, progress: ProgressV2 }.
// 구 v1 값(LEGACY_PROGRESS_KEY, `{ [seriesId]: string[] }`)은 v2 키가 없을 때 한 번만 변환하고, 원본은 지우지 않는다
// (롤백 경로). 화면·훅이 쓰는 `{ [seriesId]: string[] }` 완료 목록은 v2에서 파생해 그대로 제공한다.
//
// 진행도를 바꾸는 모든 경로(토글, 여기까지 완료, 일괄 완료, Life Hub 제안 승인, 수동 가져오기)는 commit()을 거치며
// 시각(at)을 찍은 v2 항목을 쓴다. 체크 해제는 done:false 묘비로 남는다.
import type { ProgressMap } from '../../types';
import { readJson, writeJson, onExternalChange } from '../storage';
import { getSeries, orderedItems } from '../catalog';
import { getClockFloor } from './clock';
import { resolveImport, type ProgressBackup } from './backup';
import { mergeProgressV2 } from './merge';
import {
  completedMap, fromV1, latestAt, makeDocV2, normalizeProgress, normalizeV2, progressOfDocV2, pruneTombstones, sameProgress, setDone,
  type ProgressV2,
} from './model';

export const PROGRESS_KEY = 'animan:progress:v2';
/** 롤백용으로 그대로 남겨 두는 구 키. 이 모듈은 읽기만 한다. */
export const LEGACY_PROGRESS_KEY = 'animan:progress:v1';

export type ItemKind = 'episode' | 'volume';
export type ImportMode = 'merge' | 'replace';

/** 저장된 v2 문서(없으면 v1 변환본)를 읽는다. */
const load = (): ProgressV2 => {
  const raw = readJson(PROGRESS_KEY);
  if (raw !== undefined) {
    const doc = progressOfDocV2(raw);
    if (doc) return doc;
    console.warn('[progress] v2 기록을 해석하지 못했어요. 빈 기록으로 시작합니다.');
    return {};
  }
  // v2 키가 없을 때만, 한 번 변환한다. at 은 고정된 아주 이른 시각이라 다른 기기의 실제 변경이 항상 이긴다.
  const legacy = normalizeProgress(readJson(LEGACY_PROGRESS_KEY));
  if (!legacy || Object.keys(legacy).length === 0) return {};
  const converted = fromV1(legacy);
  writeJson(PROGRESS_KEY, makeDocV2(converted, new Date()));
  return converted;
};

let state: ProgressV2 = load();
let completed: ProgressMap = completedMap(state);
let lastStamp = 0;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

/** 완료 목록 참조는 내용이 바뀔 때만 새로 만든다(useSyncExternalStore 가 불필요하게 다시 그리지 않게). */
const refreshCompleted = () => {
  const next = completedMap(state);
  if (JSON.stringify(next) !== JSON.stringify(completed)) completed = next;
};

/**
 * 이번 조작의 기준 시각. 지금 시각, 마지막으로 본 서버 written_at + 1ms, 이 기기가 앞서 찍은 시각 + 1ms 중 가장 늦은 것.
 * 같은 기기에서 연속으로 바꿔도 시각이 줄지 않고, 같은 항목을 같은 ms 안에 체크→해제해도 해제가 이긴다.
 */
const stampMs = (): number => {
  const ms = Math.max(Date.now(), getClockFloor() + 1, lastStamp + 1);
  lastStamp = ms;
  return ms;
};

const commit = (next: ProgressV2) => {
  // 묘비 정리는 병합 안이 아니라 쓰기 직전에만 한다.
  state = pruneTombstones(next, Date.now());
  lastStamp = Math.max(lastStamp, latestAt(state));
  writeJson(PROGRESS_KEY, makeDocV2(state, new Date()));
  refreshCompleted();
  notify();
};

onExternalChange(PROGRESS_KEY, () => {
  state = load();
  lastStamp = Math.max(lastStamp, latestAt(state));
  refreshCompleted();
  notify();
});

// ── 읽기 ─────────────────────────────────────────────────────────────────────

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** 화면용 진행 기록: 작품 id → 완료한 id 목록(스냅샷, 불변으로 다룰 것). v2 에서 파생한다. */
export const getProgress = (): ProgressMap => completed;

/** 묘비를 포함한 전체 v2 진행 기록(스냅샷, 불변으로 다룰 것). */
export const getProgressV2 = (): ProgressV2 => state;

export const getCompletedIds = (seriesId: string): string[] => completed[seriesId] ?? [];

export const isCompleted = (seriesId: string, itemId: string) => state[seriesId]?.[itemId]?.done === true;

// ── 쓰기 ─────────────────────────────────────────────────────────────────────

/** ids를 완료로 표시한다. 새로 완료된 ID 목록을 반환(묘비였던 항목은 다시 완료로 돌아온다). */
export const markCompleted = (seriesId: string, ids: string[]): string[] => {
  const { next, changed } = setDone(state, seriesId, ids, true, stampMs());
  if (changed.length > 0) commit(next);
  return changed;
};

/** ids를 미완료로 되돌린다(묘비를 남긴다). 실제로 해제된 ID 목록을 반환. */
export const unmarkCompleted = (seriesId: string, ids: string[]): string[] => {
  const { next, changed } = setDone(state, seriesId, ids, false, stampMs());
  if (changed.length > 0) commit(next);
  return changed;
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

/** 백업 파일(v1/v2)을 들여온다. merge = 항목별 마지막 쓰기 우선, replace = 완료 집합을 파일과 같게(사라지는 항목은 묘비). */
export const importBackup = (backup: ProgressBackup, mode: ImportMode = 'merge') => {
  commit(resolveImport(state, backup, mode, stampMs()));
};

/**
 * 구 모양({ [seriesId]: string[] }) 완료 목록을 들여온다. 콘솔(`window.animan.progress`)과 기존 호출부용.
 * at 은 지정하지 않으면 지금 시각이다.
 */
export const importProgress = (incoming: ProgressMap, mode: ImportMode = 'merge') => {
  const clean = normalizeProgress(incoming) ?? {};
  const now = stampMs();
  const backup: ProgressBackup = { app: 'animan', version: 1, exportedAt: new Date(now).toISOString(), progress: clean };
  commit(resolveImport(state, backup, mode, now));
};

/**
 * 동기화: 서버 문서를 로컬에 합친다. 로컬에 쓰는 것은 언제나 "로컬 ∪ 서버"의 병합 결과뿐이다.
 * 합친 뒤의 전체 진행 기록을 돌려준다.
 */
export const applyRemote = (remote: unknown): ProgressV2 => {
  const merged = pruneTombstones(mergeProgressV2(state, normalizeV2(remote) ?? {}), Date.now());
  if (!sameProgress(merged, state)) commit(merged);
  return state;
};

/** 테스트용: localStorage에서 다시 읽는다. */
export const reloadProgress = () => {
  state = load();
  refreshCompleted();
  notify();
};
