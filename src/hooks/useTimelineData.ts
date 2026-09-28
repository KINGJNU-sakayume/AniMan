// src/hooks/useTimelineData.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchTimelineData } from '../lib/api';
import type { TimelineData } from '../types';

// 한 번 본 작품은 다시 들어올 때 즉시 보여주고 뒤에서 새로 고친다.
const cache = new Map<string, TimelineData>();

/**
 * 선택된 작품의 시즌/에피소드/단행본을 불러온다.
 * seriesId 가 바뀌면 이전 요청의 응답은 버린다(race condition 방지).
 */
export const useTimelineData = (seriesId: string | null) => {
  const [data, setData] = useState<TimelineData | null>(() => (seriesId ? cache.get(seriesId) ?? null : null));
  const [loading, setLoading] = useState(() => Boolean(seriesId && !cache.has(seriesId)));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!seriesId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let ignore = false;
    const cached = cache.get(seriesId) ?? null;
    setData(cached);
    setLoading(!cached);
    setError(null);

    fetchTimelineData(seriesId)
      .then((result) => {
        cache.set(seriesId, result);
        if (!ignore) setData(result);
      })
      .catch((err: unknown) => {
        console.error('[useTimelineData] fetch failed:', err);
        if (!ignore && !cached) setError('작품 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => { ignore = true; };
  }, [seriesId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, error, retry };
};
