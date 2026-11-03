// src/lib/progress/index.ts
// 진행 기록 공개 API. 화면 밖(콘솔: window.animan.progress, Life Hub 연동, 기기 동기화)에서도 이것만 쓰면 된다.
import { getCatalog } from '../catalog';
import type { CatalogIndex, ProgressBackup } from './backup';
import { createBackup, previewImport } from './backup';
import { getProgressV2, importBackup, type ImportMode } from './store';

export {
  subscribe,
  getProgress,
  getProgressV2,
  getCompletedIds,
  isCompleted,
  markCompleted,
  unmarkCompleted,
  toggleCompleted,
  markUpTo,
  importProgress,
  importBackup,
  applyRemote,
  PROGRESS_KEY,
  LEGACY_PROGRESS_KEY,
} from './store';
export type { ItemKind, ImportMode } from './store';
export { mergeProgressV2 } from './merge';
export type { ItemEntry, ProgressV2 } from './model';
export { createBackup, createBackupV1, parseBackup, previewImport, backupFileName } from './backup';
export type { ProgressBackup, ImportPreview, ImportPreviewRow, ParseResult } from './backup';

/** 현재 카탈로그로 미리보기용 인덱스를 만든다. */
export const buildCatalogIndex = (): CatalogIndex =>
  Object.fromEntries(
    getCatalog().map((s) => [
      s.id,
      { title: s.title, itemIds: new Set([...s.episodes, ...s.volumes].map((i) => i.id)) },
    ])
  );

export const exportBackup = (): ProgressBackup => createBackup(getProgressV2());

export const previewBackup = (backup: ProgressBackup, mode: ImportMode = 'merge') =>
  previewImport(getProgressV2(), backup, mode, buildCatalogIndex());

export const applyBackup = (backup: ProgressBackup, mode: ImportMode = 'merge') => importBackup(backup, mode);
