// src/lib/progress/backup.ts
// 진행 기록 백업 파일 형식과 불러오기 미리보기.
//
// v2(현재): { app:'animan', version:2, exportedAt, progress: { [작품 id]: { [항목 id]: { done, at } } } }
// v1(구형, 가져오기만 지원): { app:'animan', version:1, exportedAt, progress: { [작품 id]: string[] } }
//  - v1 파일을 가져올 때는 모든 id 가 done:true, at = 파일의 exportedAt (없거나 해석 못 하면 epoch).
//  - 구형(v1) 내보내기는 legacyExport.ts 에 따로 두었다(화면·공개 API 어디에서도 쓰지 않는다).
import type { ProgressMap } from '../../types';
import { mergeProgressV2 } from './merge';
import {
  EPOCH_AT, completedMap, fromV1, isoOf, makeDocV2, normalizeProgress, normalizeV2, parseAt, pruneTombstones, replaceCompleted,
  type ProgressDocV2, type ProgressV2,
} from './model';
import type { ImportMode } from './store';

export const BACKUP_APP = 'animan';
export const BACKUP_VERSION = 2;

export interface ProgressBackupV1 {
  app: typeof BACKUP_APP;
  version: 1;
  exportedAt: string;
  progress: ProgressMap;
}
export type ProgressBackupV2 = ProgressDocV2;
export type ProgressBackup = ProgressBackupV1 | ProgressBackupV2;

export type ParseResult =
  | { ok: true; backup: ProgressBackup }
  | { ok: false; error: string };

/** v2 백업(내보내기 기본 형식). 묘비는 쓰기 직전 규칙대로 180일이 지난 것만 뺀다. */
export const createBackup = (progress: ProgressV2, now: Date = new Date()): ProgressBackupV2 =>
  makeDocV2(pruneTombstones(normalizeV2(progress) ?? {}, now.getTime()), now);

export const backupFileName = (now: Date = new Date()) =>
  `animan-backup-${now.toISOString().slice(0, 10)}.json`;

/** 백업 JSON 문자열을 검증·정규화한다. v1 과 v2 를 받는다. */
export const parseBackup = (text: string): ParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다.' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '백업 파일 형식이 아닙니다.' };
  }
  const r = raw as Record<string, unknown>;
  if (r.app !== BACKUP_APP) return { ok: false, error: 'AniMan 백업 파일이 아닙니다 (app 값 불일치).' };
  const exportedAt = typeof r.exportedAt === 'string' ? r.exportedAt : '';
  if (r.version === 1) {
    const progress = normalizeProgress(r.progress);
    if (!progress) return { ok: false, error: 'progress 항목이 올바르지 않습니다.' };
    return { ok: true, backup: { app: BACKUP_APP, version: 1, exportedAt, progress } };
  }
  if (r.version === 2) {
    const progress = normalizeV2(r.progress);
    if (!progress) return { ok: false, error: 'progress 항목이 올바르지 않습니다.' };
    return { ok: true, backup: { app: BACKUP_APP, version: 2, exportedAt, progress } };
  }
  return { ok: false, error: `지원하지 않는 백업 버전입니다: ${String(r.version)}` };
};

/** 백업을 v2 항목으로 바꾼다. v1 은 모두 done:true, at = 파일의 exportedAt(해석 못 하면 epoch). */
export const backupToV2 = (backup: ProgressBackup): ProgressV2 => {
  if (backup.version === 2) return backup.progress;
  const ms = parseAt(backup.exportedAt);
  return fromV1(backup.progress, ms === null ? EPOCH_AT : isoOf(ms));
};

/**
 * 불러오기 결과(순수 함수).
 *  - merge: 항목별 마지막 쓰기 우선. 파일의 해제(묘비)도 더 늦으면 적용된다.
 *  - replace: 완료 집합을 파일과 같게. 사라지는 항목은 baseMs 시각의 묘비가 되어 다음 동기화에서 되살아나지 않는다.
 */
export const resolveImport = (
  current: ProgressV2,
  backup: ProgressBackup,
  mode: ImportMode,
  baseMs: number
): ProgressV2 => {
  const incoming = backupToV2(backup);
  return mode === 'replace'
    ? replaceCompleted(current, completedMap(incoming), baseMs)
    : mergeProgressV2(current, incoming);
};

export interface ImportPreviewRow {
  seriesId: string;
  /** 카탈로그에 있으면 제목, 없으면 null */
  title: string | null;
  before: number;
  after: number;
  added: number;
  removed: number;
  /** 카탈로그의 에피소드/권 ID와 맞지 않는 들어올 ID 수 */
  unknownIds: number;
}

export interface ImportPreview {
  mode: ImportMode;
  rows: ImportPreviewRow[];
  totalAdded: number;
  totalRemoved: number;
  result: ProgressV2;
}

/** 카탈로그 정보: 시리즈 ID → { 제목, 유효 항목 ID 집합 } */
/** `labels`(항목 id → "Ep 3"/"Vol 2")가 있으면 지울 항목 목록에서 번호로 보여 준다. */
export type CatalogIndex = Record<string, { title: string; itemIds: Set<string>; labels?: Record<string, string> }>;

/** 불러오기를 적용했을 때의 변화를 계산한다(상태는 바꾸지 않음). */
export const previewImport = (
  current: ProgressV2,
  backup: ProgressBackup,
  mode: ImportMode,
  catalog: CatalogIndex = {},
  baseMs: number = Date.now()
): ImportPreview => {
  return previewResult(current, resolveImport(current, backup, mode, baseMs), backupToV2(backup), mode, catalog);
};

/** 이미 계산된 결과(result)를 현재(current)와 견줘 미리보기를 만든다. incomingV2 는 들어오는 쪽(파일/서버 문서). */
export const previewResult = (
  current: ProgressV2,
  result: ProgressV2,
  incomingV2: ProgressV2,
  mode: ImportMode,
  catalog: CatalogIndex = {}
): ImportPreview => {
  const before = completedMap(current);
  const after = completedMap(result);
  const incoming = completedMap(incomingV2);
  const incomingSeries = new Set(Object.keys(incomingV2));
  const seriesIds = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const rows: ImportPreviewRow[] = [];
  for (const seriesId of seriesIds) {
    const b = before[seriesId] ?? [];
    const a = after[seriesId] ?? [];
    const beforeSet = new Set(b);
    const afterSet = new Set(a);
    const added = a.filter((id) => !beforeSet.has(id)).length;
    const removed = b.filter((id) => !afterSet.has(id)).length;
    if (added === 0 && removed === 0 && !incomingSeries.has(seriesId)) continue;
    const info = catalog[seriesId];
    rows.push({
      seriesId,
      title: info?.title ?? null,
      before: b.length,
      after: a.length,
      added,
      removed,
      unknownIds: info
        ? (incoming[seriesId] ?? []).filter((id) => !info.itemIds.has(id)).length
        : (incoming[seriesId] ?? []).length,
    });
  }
  return {
    mode,
    rows,
    totalAdded: rows.reduce((n, r) => n + r.added, 0),
    totalRemoved: rows.reduce((n, r) => n + r.removed, 0),
    result,
  };
};
