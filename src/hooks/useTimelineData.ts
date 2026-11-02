// src/hooks/useTimelineData.ts
import { useMemo } from 'react';
import { toTimelineData } from '../lib/catalog';
import { useCatalog } from './useCatalog';
import type { SeriesListOption } from '../types';

export type { SeriesListOption };

/**
 * 번들 카탈로그(+로컬 초안)에서 시리즈 데이터를 읽는다. 네트워크 요청 없음.
 *
 * @param seriesId 선택된 시리즈 ID. 비어 있으면 data는 null.
 * @returns `{ data, seriesList, loading, error }` — 기존 Supabase 버전과 같은 형태.
 */
export const useTimelineData = (seriesId?: string) => {
  const catalog = useCatalog();

  return useMemo(() => {
    const seriesList: SeriesListOption[] = catalog.map((s) => ({ id: s.id, title: s.title }));
    if (!seriesId) return { data: null, seriesList, loading: false, error: null };
    const record = catalog.find((s) => s.id === seriesId);
    return {
      data: record ? toTimelineData(record) : null,
      seriesList,
      loading: false,
      error: record ? null : '작품을 찾을 수 없습니다.',
    };
  }, [catalog, seriesId]);
};
