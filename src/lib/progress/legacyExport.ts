// src/lib/progress/legacyExport.ts
// 구형(v1) 백업 내보내기 — 현재 어디에서도 호출하지 않는 보관용 코드(데드코드).
// 완료 목록만 담고 체크 해제 묘비는 뺀다. 필요해지면 BackupMenu 에 연결하면 되고, 필요 없으면 이 파일을 지우면 된다.
import { BACKUP_APP, type ProgressBackupV1 } from './backup';
import { completedMap, normalizeV2, type ProgressV2 } from './model';

export const createBackupV1 = (progress: ProgressV2, now: Date = new Date()): ProgressBackupV1 => ({
  app: BACKUP_APP,
  version: 1,
  exportedAt: now.toISOString(),
  progress: completedMap(normalizeV2(progress) ?? {}),
});
