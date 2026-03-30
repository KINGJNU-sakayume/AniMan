// src/hooks/useTimelineData.ts
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { TimelineData, SeriesListOption } from '../types';

export type { SeriesListOption };

/**
 * Fetches timeline data (series info, seasons, episodes, volumes) from Supabase.
 *
 * Two effects run independently:
 * 1. On mount — loads the full list of series for the selector dropdown.
 * 2. On `seriesId` change — loads the detailed data for the selected series,
 *    with a race-condition guard (`ignore` flag) to discard stale responses.
 *
 * @param seriesId - The UUID of the currently selected series. When undefined
 *   or empty, the detail data is cleared and loading is set to false.
 * @returns
 *   - `data` — The full `TimelineData` for the selected series, or null.
 *   - `seriesList` — An array of `{ id, title }` options for the selector.
 *   - `loading` — True while the series detail fetch is in progress.
 *   - `error` — A user-facing error string, or null if no error.
 */
export const useTimelineData = (seriesId?: string) => {
  const [data, setData] = useState<TimelineData | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesListOption[]>([]);
  // C-02: 초기값을 false로 — seriesId 없을 때 setLoading(false) 미호출로 인한 무한 스피너 해소
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 작품 목록 로드 (H-05: 에러 발생 시 사용자에게 알림)
  useEffect(() => {
    const fetchSeriesList = async () => {
      const { data: seriesData, error: seriesError } = await supabase
        .from('series')
        .select('id, title')
        .order('created_at', { ascending: false });

      if (seriesError) {
        // H-05: 조용히 무시하지 않고 에러 상태 설정
        setError('작품 목록을 불러오지 못했습니다. 네트워크를 확인해주세요.');
        return;
      }
      if (seriesData) {
        setSeriesList(seriesData as SeriesListOption[]);
      }
    };
    fetchSeriesList();
  }, []);

  // 선택된 작품의 상세 데이터 로드
  useEffect(() => {
    // C-02: seriesId 없으면 loading을 false로 명시 후 종료
    if (!seriesId) {
      setLoading(false);
      setData(null);
      return;
    }

    let ignore = false; // M-08: race condition 방지 플래그

    const fetchTimelineData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: seriesData, error: seriesError } = await supabase
          .from('series')
          .select('*')
          .eq('id', seriesId)
          .single();

        if (seriesError) throw seriesError;

        const [seasonsRes, episodesRes, volumesRes] = await Promise.all([
          supabase
            .from('seasons')
            .select('*')
            .eq('series_id', seriesId)
            .order('start_chapter', { ascending: true }),
          supabase
            .from('episodes')
            .select('*')
            .eq('series_id', seriesId)
            .order('start_chapter', { ascending: true }),
          supabase
            .from('volumes')
            .select('*')
            .eq('series_id', seriesId)
            .order('start_chapter', { ascending: true }),
        ]);

        if (seasonsRes.error) throw seasonsRes.error;
        if (episodesRes.error) throw episodesRes.error;
        if (volumesRes.error) throw volumesRes.error;

        // M-08: 언마운트 or 다른 seriesId로 전환된 경우 상태 업데이트 생략
        if (ignore) return;

        setData({
          series: {
            ...seriesData,
            coverUrl: seriesData.cover_url,
            bannerUrl: seriesData.banner_url,
            accentColor: seriesData.accent_color ?? '#03acb1',
            youtubeBgmId: seriesData.youtube_bgm_id,
          },
          seasons: (seasonsRes.data ?? []).map((s) => ({
            ...s,
            startChapter: Number(s.start_chapter),
            endChapter: s.end_chapter != null ? Number(s.end_chapter) : null,
          })),
          episodes: (episodesRes.data ?? []).map((e) => ({
            ...e,
            number: e.episode_number,
            startChapter: Number(e.start_chapter),
            endChapter: Number(e.end_chapter),
            coverUrl: e.cover_url,
            duration: e.duration != null ? Number(e.duration) : undefined,
          })),
          volumes: (volumesRes.data ?? []).map((v) => ({
            ...v,
            number: v.volume_number,
            startChapter: Number(v.start_chapter),
            endChapter: Number(v.end_chapter),
            coverUrl: v.cover_url,
          })),
        });
      } catch (err: unknown) {
        if (ignore) return;
        console.error('Data fetch error:', err);
        setError('데이터를 불러오는데 실패했습니다.');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchTimelineData();

    // M-08: 클린업 — 컴포넌트 언마운트 or seriesId 변경 시 이전 fetch 결과 무시
    return () => {
      ignore = true;
    };
  }, [seriesId]);

  return { data, seriesList, loading, error };
};
