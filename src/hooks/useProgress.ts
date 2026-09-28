// src/hooks/useProgress.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { fetchProgress, saveProgress } from '../lib/api';
import type { CompletedMap } from '../types';

/**
 * 작품별 시청/독서 완료 목록을 관리하고 Supabase `user_progress` 에 저장한다.
 *
 * - 화면은 낙관적으로 즉시 갱신하고, 저장은 작품 단위로 직렬화한다. 요청이 진행 중일 때
 *   생긴 변경은 모아 두었다가 끝나는 즉시 "최신 상태"로 한 번 더 저장하므로,
 *   빠르게 연속 클릭해도 응답 순서가 뒤바뀌어 옛 상태가 덮어쓰는 일이 없다.
 * - 저장/불러오기 실패는 토스트로 알린다(예전에는 콘솔에만 남아 사용자가 몰랐다).
 *
 * @param userId 로그인한 사용자 id. null 이면 비우고 아무것도 저장하지 않는다.
 */
export const useProgress = (userId: string | null) => {
  const [completedMap, setCompletedMap] = useState<CompletedMap>({});
  const [pendingSaves, setPendingSaves] = useState(0);
  const latest = useRef<CompletedMap>({});
  const inFlight = useRef(new Set<string>());
  const dirty = useRef(new Set<string>());

  useEffect(() => {
    latest.current = {};
    setCompletedMap({});
    if (!userId) return;

    let cancelled = false;
    fetchProgress()
      .then((map) => {
        if (cancelled) return;
        latest.current = map;
        setCompletedMap(map);
      })
      .catch((err) => {
        console.error('[useProgress] Failed to load progress:', err);
        if (!cancelled) toast.error('진도를 불러오지 못했습니다. 새로고침 해주세요.', { id: 'progress-load' });
      });
    return () => { cancelled = true; };
  }, [userId]);

  const persist = useCallback(async (seriesId: string) => {
    if (!userId) return;
    if (inFlight.current.has(seriesId)) {
      dirty.current.add(seriesId);
      return;
    }
    inFlight.current.add(seriesId);
    setPendingSaves((n) => n + 1);
    try {
      do {
        dirty.current.delete(seriesId);
        await saveProgress(userId, seriesId, latest.current[seriesId] ?? []);
      } while (dirty.current.has(seriesId));
      toast.dismiss('progress-save');
    } catch (err) {
      console.error('[useProgress] Failed to save progress:', err);
      toast.error('진도 저장에 실패했습니다. 다음 체크 때 다시 저장을 시도합니다.', { id: 'progress-save' });
    } finally {
      inFlight.current.delete(seriesId);
      setPendingSaves((n) => n - 1);
    }
  }, [userId]);

  /** 한 작품의 목록을 바꾸고 저장을 예약한다. 바뀌기 전 목록을 돌려준다(실행 취소용). */
  const update = useCallback((seriesId: string, next: (prev: string[]) => string[]) => {
    const prev = latest.current[seriesId] ?? [];
    latest.current = { ...latest.current, [seriesId]: next(prev) };
    setCompletedMap(latest.current);
    void persist(seriesId);
    return prev;
  }, [persist]);

  const toggle = useCallback(
    (seriesId: string, itemId: string) =>
      update(seriesId, (prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId])),
    [update],
  );

  /** ids 를 모두 완료로 표시(합집합). 이전 목록을 돌려준다. */
  const completeMany = useCallback(
    (seriesId: string, ids: string[]) => update(seriesId, (prev) => Array.from(new Set([...prev, ...ids]))),
    [update],
  );

  /** 목록 전체를 교체 — 실행 취소에 쓴다. */
  const replace = useCallback((seriesId: string, ids: string[]) => update(seriesId, () => ids), [update]);

  return { completedMap, toggle, completeMany, replace, syncing: pendingSaves > 0 };
};
