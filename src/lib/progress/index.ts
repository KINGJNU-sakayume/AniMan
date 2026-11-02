// src/lib/progress/index.ts
// 진행 기록 공개 API. 화면 밖(콘솔: window.animan.progress, 향후 Life Hub 연동)에서도 이것만 쓰면 된다.
import { getCatalog } from '../catalog';
import type { CatalogIndex, ProgressBackup } from './backup';
import { createBackup, previewImport } from './backup';
import { getProgress, importProgress, type ImportMode } from './store';

export {
  subscribe,
  getProgress,
  getCompletedIds,
  isCompleted,
  markCompleted,
  unmarkCompleted,
  toggleCompleted,
  markUpTo,
  importProgress,
  mergeProgress,
  PROGRESS_KEY,
} from './store';
export type { ItemKind, ImportMode } from './store';
export { createBackup, parseBackup, previewImport, backupFileName } from './backup';
export type { ProgressBackup, ImportPreview, ImportPreviewRow, ParseResult } from './backup';

/** 현재 카탈로그로 미리보기용 인덱스를 만든다. */
export const buildCatalogIndex = (): CatalogIndex =>
  Object.fromEntries(
    getCatalog().map((s) => [
      s.id,
      { title: s.title, itemIds: new Set([...s.episodes, ...s.volumes].map((i) => i.id)) },
    ])
  );

export const exportBackup = (): ProgressBackup => createBackup(getProgress());

export const previewBackup = (backup: ProgressBackup, mode: ImportMode = 'merge') =>
  previewImport(getProgress(), backup.progress, mode, buildCatalogIndex());

export const applyBackup = (backup: ProgressBackup, mode: ImportMode = 'merge') =>
  importProgress(backup.progress, mode);
