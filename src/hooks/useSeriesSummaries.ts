// src/hooks/useSeriesSummaries.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchSeriesSummaries } from '../lib/api';
import type { SeriesSummary } from '../types';

// 목록으로 돌아올 때 스피너 없이 바로 그리고(스크롤 위치 복원에도 필요) 뒤에서 새로 고친다.
let cache: SeriesSummary[] | null = null;

export const useSeriesSummaries = () => {
  const [series, setSeries] = useState<SeriesSummary[] | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    setError(null);
    fetchSeriesSummaries()
      .then((result) => {
        cache = result;
        if (!ignore) setSeries(result);
      })
      .catch((err: unknown) => {
        console.error('[useSeriesSummaries] fetch failed:', err);
        if (!ignore && !cache) setError('작품 목록을 불러오지 못했습니다.');
      });
    return () => { ignore = true; };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { series, loading: series === null && !error, error, retry };
};
