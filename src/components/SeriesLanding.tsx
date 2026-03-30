// src/components/SeriesLanding.tsx
import { useEffect, useState } from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SeriesCardData {
  id: string;
  title: string;
  cover_url: string | null;
  banner_url: string | null;
  accent_color: string | null;
  epIds: string[];
  volIds: string[];
}

interface SeriesLandingProps {
  completedMap: Record<string, string[]>;
  onSelectSeries: (id: string) => void;
  onAdminClick: () => void;
}

export const SeriesLanding = ({ completedMap, onSelectSeries, onAdminClick }: SeriesLandingProps) => {
  const [seriesCards, setSeriesCards] = useState<SeriesCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLandingData = async () => {
      try {
        const [seriesRes, epsRes, volsRes] = await Promise.all([
          supabase
            .from('series')
            .select('id, title, cover_url, banner_url, accent_color')
            .order('created_at', { ascending: false }),
          supabase.from('episodes').select('id, series_id'),
          supabase.from('volumes').select('id, series_id'),
        ]);

        if (seriesRes.error) throw seriesRes.error;

        const epIdsBySeriesId: Record<string, string[]> = {};
        const volIdsBySeriesId: Record<string, string[]> = {};

        (epsRes.data ?? []).forEach((e) => {
          if (!epIdsBySeriesId[e.series_id]) epIdsBySeriesId[e.series_id] = [];
          epIdsBySeriesId[e.series_id].push(e.id);
        });
        (volsRes.data ?? []).forEach((v) => {
          if (!volIdsBySeriesId[v.series_id]) volIdsBySeriesId[v.series_id] = [];
          volIdsBySeriesId[v.series_id].push(v.id);
        });

        setSeriesCards(
          (seriesRes.data ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            cover_url: s.cover_url,
            banner_url: s.banner_url,
            accent_color: s.accent_color,
            epIds: epIdsBySeriesId[s.id] ?? [],
            volIds: volIdsBySeriesId[s.id] ?? [],
          }))
        );
      } catch (err) {
        console.error('[SeriesLanding] Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLandingData();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-gray-100">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: '#03acb115', border: '1px solid #03acb130' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: '#03acb1' }} />
          </div>
          <span className="text-lg font-bold text-gray-100 hidden sm:block">AniMan</span>
        </div>
        <button
          onClick={onAdminClick}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Series
        </button>
      </div>

      <div className="px-6 pt-6 pb-10">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-4">내 작품 목록</p>

        {loading ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="w-8 h-8 border-4 border-zinc-800 border-t-[#03acb1] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {seriesCards.map((series) => {
              const completedIds = completedMap[series.id] ?? [];
              const epCount = series.epIds.length;
              const volCount = series.volIds.length;
              const completedEps = series.epIds.filter((id) => completedIds.includes(id)).length;
              const completedVols = series.volIds.filter((id) => completedIds.includes(id)).length;
              const epPct = epCount ? Math.round((completedEps / epCount) * 100) : 0;
              const volPct = volCount ? Math.round((completedVols / volCount) * 100) : 0;
              const isCompleted = epCount > 0 && volCount > 0 && epPct === 100 && volPct === 100;
              const accentColor = series.accent_color ?? '#03acb1';
              const coverImage = series.cover_url ?? series.banner_url;

              return (
                <div
                  key={series.id}
                  onClick={() => onSelectSeries(series.id)}
                  className="rounded-[10px] overflow-hidden border border-white/10 cursor-pointer transition-transform hover:scale-[1.03] relative"
                  style={{ outline: '1px solid transparent' }}
                >
                  {/* Cover image — top ~60% */}
                  <div className="relative" style={{ paddingBottom: '60%' }}>
                    {coverImage ? (
                      <img
                        src={coverImage}
                        alt={series.title}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${accentColor}40 0%, ${accentColor}10 100%)`,
                        }}
                      />
                    )}
                    {/* Completed badge */}
                    {isCompleted && (
                      <span className="absolute top-2 right-2 bg-zinc-700 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full font-medium">
                        완료
                      </span>
                    )}
                  </div>

                  {/* Info section */}
                  <div className="bg-zinc-900 p-3">
                    <p className="text-sm font-semibold text-white truncate mb-1">{series.title}</p>
                    <p className="text-xs text-zinc-400 mb-2">
                      Anime {epPct}% · Manga {volPct}%
                    </p>
                    {/* Progress bar */}
                    <div className="h-1 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${epPct}%`, backgroundColor: accentColor }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* "Add new" card */}
            <div
              onClick={onAdminClick}
              className="rounded-[10px] border border-dashed border-zinc-700 cursor-pointer flex flex-col items-center justify-center gap-2 transition-colors hover:border-zinc-500 hover:bg-zinc-900/50"
              style={{ minHeight: '160px' }}
            >
              <span className="text-zinc-600 text-2xl font-light">+</span>
              <span className="text-xs text-zinc-600">작품 추가</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
