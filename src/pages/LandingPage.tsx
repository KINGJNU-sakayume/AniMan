// src/pages/LandingPage.tsx
import { Check, Plus, RefreshCw } from 'lucide-react';
import { useSeriesSummaries } from '../hooks/useSeriesSummaries';
import { readableTextOn, withAlpha } from '../lib/color';
import { episodeLabel, summarizeProgress, volumeLabel } from '../lib/progress';
import type { CompletedMap, SeriesSummary } from '../types';

interface LandingPageProps {
  completedMap: CompletedMap;
  onSelectSeries: (id: string) => void;
  /** 관리자에게만 전달된다 */
  onAddSeries?: () => void;
}

const GRID = 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4';

const SeriesCard = ({ series, completedIds, onSelect }: { series: SeriesSummary; completedIds: string[]; onSelect: () => void }) => {
  const { episodes, volumes, nextEpisode, nextVolume } = summarizeProgress(series, completedIds);
  const accent = series.accentColor;
  const image = series.bannerUrl ?? series.coverUrl;
  const isCompleted = episodes.total > 0 && volumes.total > 0 && episodes.done === episodes.total && volumes.done === volumes.total;
  const started = episodes.done + volumes.done > 0;
  const next = [nextEpisode && episodeLabel(nextEpisode.number), nextVolume && volumeLabel(nextVolume.number)].filter(Boolean).join(' · ');

  return (
    <button
      onClick={onSelect}
      className="group text-left rounded-xl overflow-hidden border border-white/10 bg-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-xl hover:shadow-black/40"
    >
      <div className="relative aspect-[5/3] overflow-hidden">
        {image ? (
          <img src={image} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${withAlpha(accent, 0.25)} 0%, ${withAlpha(accent, 0.06)} 100%)` }} />
        )}
        {isCompleted && (
          <span
            className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shadow"
            style={{ backgroundColor: accent, color: readableTextOn(accent) }}
          >
            <Check className="w-3 h-3" /> 완료
          </span>
        )}
      </div>

      <div className="p-3 sm:p-3.5">
        <p className="text-sm sm:text-[15px] font-semibold text-white truncate">{series.title.replace(/\n/g, ' ')}</p>
        <div className="mt-2.5 space-y-1.5">
          {([['애니', episodes], ['만화', volumes]] as const).map(([label, stat], i) => (
            <div key={label} className="flex items-center gap-2 text-[11px] sm:text-xs text-zinc-400">
              <span className="w-6 flex-shrink-0">{label}</span>
              <span className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${stat.percent}%`, backgroundColor: i === 0 ? accent : '#a1a1aa' }}
                />
              </span>
              <span className="w-8 text-right tabular-nums">{Math.round(stat.percent)}%</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] sm:text-xs truncate" style={{ color: started && next ? accent : '#71717a' }}>
          {isCompleted ? '모두 완료했어요' : started && next ? `다음 · ${next}` : '아직 시작 전'}
        </p>
      </div>
    </button>
  );
};

export const LandingPage = ({ completedMap, onSelectSeries, onAddSeries }: LandingPageProps) => {
  const { series, loading, error, retry } = useSeriesSummaries();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-16">
      <div className="flex items-end justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">내 작품 목록</h1>
          {series && series.length > 0 && <p className="text-sm text-zinc-500 mt-1">{series.length}개 작품</p>}
        </div>
      </div>

      {loading && (
        <div className={GRID} aria-busy="true" aria-label="작품 목록을 불러오는 중">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-white/5 bg-zinc-900 animate-pulse">
              <div className="aspect-[5/3] bg-zinc-800/70" />
              <div className="p-3.5 space-y-2.5">
                <div className="h-3.5 w-2/3 rounded bg-zinc-800" />
                <div className="h-2 rounded bg-zinc-800" />
                <div className="h-2 rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center text-center gap-4 py-20">
          <p className="text-zinc-300">{error}</p>
          <button onClick={retry} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors">
            <RefreshCw className="w-4 h-4" /> 다시 시도
          </button>
        </div>
      )}

      {series && series.length === 0 && !onAddSeries && (
        <p className="py-20 text-center text-zinc-500">아직 등록된 작품이 없습니다.</p>
      )}

      {series && (series.length > 0 || onAddSeries) && (
        <div className={GRID}>
          {series.map((s) => (
            <SeriesCard key={s.id} series={s} completedIds={completedMap[s.id] ?? []} onSelect={() => onSelectSeries(s.id)} />
          ))}
          {onAddSeries && (
            <button
              onClick={onAddSeries}
              className="rounded-xl border border-dashed border-zinc-700 flex flex-col items-center justify-center gap-2 min-h-[160px] text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
            >
              <Plus className="w-6 h-6" />
              <span className="text-xs">작품 추가</span>
            </button>
          )}
        </div>
      )}
    </main>
  );
};
