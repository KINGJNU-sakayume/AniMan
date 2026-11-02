import { useSyncExternalStore } from 'react';
import { subscribe, getProgress, toggleCompleted, markCompleted } from '../lib/progress';

/**
 * 진행 기록 훅 (이 기기 localStorage).
 *
 * 저장·변경 로직은 `src/lib/progress`에 있고, 이 훅은 구독만 한다.
 * 반환 형태는 Supabase 시절과 동일하다.
 *   - `completedMap` — 시리즈 ID → 완료한 에피소드/권 ID 목록
 *   - `toggle(seriesId, itemId)` — 한 항목 토글
 *   - `bulkComplete(seriesId, ids)` — 여러 항목 완료(합집합)
 *   - `syncing` — 로컬 저장은 동기라 항상 false (호환용)
 */
export const useProgress = () => {
  const completedMap = useSyncExternalStore(subscribe, getProgress, getProgress);
  return {
    completedMap,
    toggle: (seriesId: string, itemId: string) => {
      toggleCompleted(seriesId, itemId);
    },
    bulkComplete: (seriesId: string, ids: string[]) => {
      markCompleted(seriesId, ids);
    },
    syncing: false,
  };
};
