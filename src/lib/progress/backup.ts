// src/lib/progress/backup.ts
// 진행 기록 백업 파일 형식과 불러오기 미리보기.
//
// 형식: { app: 'animan', version: 1, exportedAt: ISO 문자열, progress: { [seriesId]: string[] } }
import type { ProgressMap } from '../../types';
import { mergeProgress, normalizeProgress, type ImportMode } from './store';

export const BACKUP_APP = 'animan';
export const BACKUP_VERSION = 1;

export interface ProgressBackup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  progress: ProgressMap;
}

export type ParseResult =
  | { ok: true; backup: ProgressBackup }
  | { ok: false; error: string };

export const createBackup = (progress: ProgressMap, now: Date = new Date()): ProgressBackup => ({
  app: BACKUP_APP,
  version: BACKUP_VERSION,
  exportedAt: now.toISOString(),
  progress: normalizeProgress(progress) ?? {},
});

export const backupFileName = (now: Date = new Date()) =>
  `animan-backup-${now.toISOString().slice(0, 10)}.json`;

/** 백업 JSON 문자열을 검증·정규화한다. */
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
  if (r.version !== BACKUP_VERSION) {
    return { ok: false, error: `지원하지 않는 백업 버전입니다: ${String(r.version)}` };
  }
  const progress = normalizeProgress(r.progress);
  if (!progress) return { ok: false, error: 'progress 항목이 올바르지 않습니다.' };
  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: typeof r.exportedAt === 'string' ? r.exportedAt : '',
      progress,
    },
  };
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
  result: ProgressMap;
}

/** 카탈로그 정보: 시리즈 ID → { 제목, 유효 항목 ID 집합 } */
export type CatalogIndex = Record<string, { title: string; itemIds: Set<string> }>;

/** 불러오기를 적용했을 때의 변화를 계산한다(상태는 바꾸지 않음). */
export const previewImport = (
  current: ProgressMap,
  incoming: ProgressMap,
  mode: ImportMode,
  catalog: CatalogIndex = {}
): ImportPreview => {
  const result = mergeProgress(current, incoming, mode);
  const seriesIds = Array.from(new Set([...Object.keys(current), ...Object.keys(result)]));
  const rows: ImportPreviewRow[] = [];
  for (const seriesId of seriesIds) {
    const before = current[seriesId] ?? [];
    const after = result[seriesId] ?? [];
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const added = after.filter((id) => !beforeSet.has(id)).length;
    const removed = before.filter((id) => !afterSet.has(id)).length;
    if (added === 0 && removed === 0 && !(seriesId in incoming)) continue;
    const info = catalog[seriesId];
    rows.push({
      seriesId,
      title: info?.title ?? null,
      before: before.length,
      after: after.length,
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
