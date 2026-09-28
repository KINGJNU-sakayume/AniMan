// src/pages/SeriesPage.tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { Hero } from '../components/Hero';
import { SocialCard } from '../components/SocialCard';
import { Spinner } from '../components/Spinner';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Timeline, type TimelineProps } from '../components/timeline/Timeline';
import { useTimelineData } from '../hooks/useTimelineData';
import { episodeLabel, idsUpTo, summarizeProgress, volumeLabel } from '../lib/progress';
import type { MediaKind, TimelineData } from '../types';

interface SeriesPageProps {
  seriesId: string;
  completedIds: string[];
  onToggle: (seriesId: string, id: string) => void;
  onCompleteMany: (seriesId: string, ids: string[]) => string[];
  onReplace: (seriesId: string, ids: string[]) => void;
  onBack: () => void;
  onAccentChange?: (color: string) => void;
}

export const SeriesPage = ({ seriesId, completedIds, onToggle, onCompleteMany, onReplace, onBack, onAccentChange }: SeriesPageProps) => {
  const { data, loading, error, retry } = useTimelineData(seriesId);
  const accent = data?.series.accentColor;
  useEffect(() => {
    if (accent) onAccentChange?.(accent);
  }, [accent, onAccentChange]);
  const [showSocialCard, setShowSocialCard] = useState(false);
  const [focusRequest, setFocusRequest] = useState<TimelineProps['focusRequest']>(null);

  const progress = useMemo(() => (data ? summarizeProgress(data, completedIds) : null), [data, completedIds]);

  const handleToggle = useCallback((id: string) => onToggle(seriesId, id), [onToggle, seriesId]);

  /** "여기까지 모두 완료" — 실수로 눌러도 되돌릴 수 있게 실행 취소 토스트를 띄운다. */
  const handleCompleteUpTo = useCallback(
    (kind: MediaKind, id: string) => {
      if (!data) return;
      const list: Array<{ id: string; number: string | number }> = kind === 'episode' ? data.episodes : data.volumes;
      const ids = idsUpTo(list, id);
      const already = new Set(completedIds);
      const added = ids.filter((x) => !already.has(x)).length;
      if (added === 0) {
        toast('이미 모두 완료된 구간입니다.', { id: 'bulk', icon: '✓' });
        return;
      }
      const previous = onCompleteMany(seriesId, ids);
      const last = list.find((item) => item.id === id);
      const label = last ? (kind === 'episode' ? episodeLabel(last.number) : volumeLabel(Number(last.number))) : '';
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span>{label}까지 {added}개 완료 처리</span>
            <button
              className="font-semibold underline underline-offset-2"
              style={{ color: data.series.accentColor }}
              onClick={() => {
                onReplace(seriesId, previous);
                toast.dismiss(t.id);
              }}
            >
              실행 취소
            </button>
          </span>
        ),
        { id: 'bulk', duration: 6000 },
      );
    },
    [data, completedIds, onCompleteMany, onReplace, seriesId],
  );

  const handleJumpToNext = useCallback(
    (kind: MediaKind) => {
      if (!data || !progress) return;
      const list = kind === 'episode' ? data.episodes : data.volumes;
      const target = (kind === 'episode' ? progress.nextEpisode : progress.nextVolume) ?? list[list.length - 1];
      if (!target) return;
      // PC 타임라인은 바로 스크롤, 모바일은 Timeline 이 펼치기/탭 전환 후 스크롤한다.
      document.getElementById(`node-${target.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' });
      setFocusRequest({ kind, id: target.id, nonce: Date.now() });
    },
    [data, progress],
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  if (error || !data || !progress) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[60vh] gap-4 px-6">
        <h2 className="text-xl font-bold text-zinc-100">작품을 불러오지 못했어요</h2>
        <p className="text-zinc-400 text-sm">{error ?? '존재하지 않거나 삭제된 작품일 수 있습니다.'}</p>
        <div className="flex gap-2">
          <button onClick={retry} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors">
            <RefreshCw className="w-4 h-4" /> 다시 시도
          </button>
          <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 목록으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <SeriesContent
      data={data}
      progress={progress}
      completedIds={completedIds}
      focusRequest={focusRequest}
      showSocialCard={showSocialCard}
      setShowSocialCard={setShowSocialCard}
      onToggle={handleToggle}
      onCompleteUpTo={handleCompleteUpTo}
      onJumpToNext={handleJumpToNext}
    />
  );
};

interface SeriesContentProps {
  data: TimelineData;
  progress: ReturnType<typeof summarizeProgress>;
  completedIds: string[];
  focusRequest: TimelineProps['focusRequest'];
  showSocialCard: boolean;
  setShowSocialCard: (open: boolean) => void;
  onToggle: (id: string) => void;
  onCompleteUpTo: (kind: MediaKind, id: string) => void;
  onJumpToNext: (kind: MediaKind) => void;
}

const SeriesContent = ({
  data, progress, completedIds, focusRequest, showSocialCard, setShowSocialCard, onToggle, onCompleteUpTo, onJumpToNext,
}: SeriesContentProps) => {
  const closeCard = useCallback(() => setShowSocialCard(false), [setShowSocialCard]);
  return (
    <>
      <motion.main key={data.series.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <ErrorBoundary>
          <Hero series={data.series} progress={progress} onOpenSocialCard={() => setShowSocialCard(true)} onJumpToNext={onJumpToNext} />
          <Timeline data={data} completedIds={completedIds} onToggle={onToggle} onCompleteUpTo={onCompleteUpTo} focusRequest={focusRequest} />
        </ErrorBoundary>
      </motion.main>
      <AnimatePresence>
        {showSocialCard && <SocialCard series={data.series} progress={progress} onClose={closeCard} />}
      </AnimatePresence>
    </>
  );
};
