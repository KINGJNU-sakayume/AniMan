// src/components/timeline/MobileTimeline.tsx
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, ChevronDown, Film } from 'lucide-react';
import { withAlpha } from '../../lib/color';
import { chapterRangeLabel, episodeLabel, volumeLabel } from '../../lib/progress';
import { placeSpan } from '../../lib/timelineLayout';
import { MobileCard } from './MobileCard';
import { SEASON_INDENT, SeasonBars } from './SeasonBars';
import { useLayout, useTimelineModel } from './model';
import type { TimelineProps } from './Timeline';
import type { Season } from '../../types';

const GAP = 4;
const MIN_EPISODE_HEIGHT = 64;
const MIN_VOLUME_HEIGHT = 92;
const STICKY_TOP = 72; // 헤더(56px) + 여유
const EXPANDED_KEY = 'animan:mobile-timeline-expanded';

type Tab = 'both' | 'episode' | 'volume';

const readExpanded = () => {
  try {
    return localStorage.getItem(EXPANDED_KEY) !== '0';
  } catch {
    return true;
  }
};

export const MobileTimeline = ({ data, completedIds, onToggle, onCompleteUpTo, focusRequest }: TimelineProps) => {
  const accent = data.series.accentColor;
  const model = useTimelineModel(data);
  const layout = useLayout(model, MIN_EPISODE_HEIGHT, MIN_VOLUME_HEIGHT);
  const place = (s: number, e: number) => placeSpan(layout, s, e, MIN_EPISODE_HEIGHT, GAP);
  const completed = useMemo(() => new Set(completedIds), [completedIds]);
  const hasSeasons = model.seasons.length > 0;

  // 트래커가 이 화면의 핵심 기능이므로 기본은 펼침. 사용자가 접으면 그 선택을 기억한다.
  const [expanded, setExpanded] = useState(readExpanded);
  const [tab, setTab] = useState<Tab>('both');

  const toggleExpanded = () => {
    setExpanded((prev) => {
      try { localStorage.setItem(EXPANDED_KEY, prev ? '0' : '1'); } catch { /* 저장 불가 환경 무시 */ }
      return !prev;
    });
  };

  // Hero 의 "다음 Ep" 버튼: 접혀 있으면 펼치고, 해당 카드가 보이는 탭으로 바꾼 뒤 스크롤
  useEffect(() => {
    if (!focusRequest) return;
    setExpanded(true);
    setTab((current) => (current === 'both' || current === focusRequest.kind ? current : focusRequest.kind));
    const frame = window.setTimeout(() => {
      document.getElementById(`card-${focusRequest.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
    return () => window.clearTimeout(frame);
  }, [focusRequest]);

  const epDone = data.episodes.filter((e) => completed.has(e.id)).length;
  const volDone = data.volumes.filter((v) => completed.has(v.id)).length;

  // ── 비교 보기: 챕터 범위에 비례한 두 열 ──
  const comparison = (
    <div>
      <div className="flex gap-2 mb-2 text-xs font-bold tracking-widest">
        <p className="flex-1 flex items-center gap-1" style={{ color: accent }}><Film className="w-3.5 h-3.5" /> ANIME</p>
        <p className="flex-1 flex items-center gap-1 text-zinc-400"><BookOpen className="w-3.5 h-3.5" /> MANGA</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="relative w-full" style={{ height: layout.total }}>
          {hasSeasons && (
            <SeasonBars seasons={model.seasons} layout={layout} accentColor={accent} minHeight={MIN_EPISODE_HEIGHT} gap={GAP} stickyTop={STICKY_TOP} />
          )}
          {model.episodes.map((ep) => {
            const { pos, dim } = place(ep.actualStart, ep.actualEnd);
            return (
              <MobileCard
                key={ep.id} id={ep.id} kind="episode"
                label={episodeLabel(ep.number)} subtitle={chapterRangeLabel(ep.startChapter, ep.endChapter)}
                coverUrl={ep.coverUrl} isCompleted={completed.has(ep.id)} accentColor={accent}
                box={{ top: pos, height: dim, left: hasSeasons ? SEASON_INDENT : 0 }}
                onToggle={onToggle} onCompleteUpTo={onCompleteUpTo}
              />
            );
          })}
        </div>
        <div className="relative w-full" style={{ height: layout.total }}>
          {model.volumes.map((vol) => {
            const { pos, dim } = place(vol.actualStart, vol.actualEnd);
            return (
              <MobileCard
                key={vol.id} id={vol.id} kind="volume"
                label={volumeLabel(vol.number)} subtitle={chapterRangeLabel(vol.startChapter, vol.endChapter)}
                coverUrl={vol.coverUrl} isCompleted={completed.has(vol.id)} accentColor={accent}
                box={{ top: pos, height: dim, left: 0 }}
                onToggle={onToggle} onCompleteUpTo={onCompleteUpTo}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── 단일 목록: 높이가 일정한 카드를 시즌별로 묶어서 ──
  const seasonOf = (start: number): Season | undefined =>
    data.seasons.find((s) => s.startChapter <= start && (s.endChapter == null || start <= s.endChapter));

  const episodeList = (
    <ol className="space-y-1.5">
      {data.episodes.map((ep, i) => {
        const season = hasSeasons ? seasonOf(ep.startChapter) : undefined;
        const showHeader = season && (i === 0 || seasonOf(data.episodes[i - 1].startChapter)?.id !== season.id);
        return (
          <li key={ep.id}>
            {showHeader && (
              <p className="flex items-center gap-2 pt-3 pb-1.5 text-xs font-bold tracking-wider" style={{ color: accent }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                {season.name}
              </p>
            )}
            <MobileCard
              id={ep.id} kind="episode"
              label={episodeLabel(ep.number)} subtitle={chapterRangeLabel(ep.startChapter, ep.endChapter)}
              coverUrl={ep.coverUrl} isCompleted={completed.has(ep.id)} accentColor={accent}
              onToggle={onToggle} onCompleteUpTo={onCompleteUpTo}
            />
          </li>
        );
      })}
    </ol>
  );

  const volumeList = (
    <ol className="space-y-1.5">
      {data.volumes.map((vol) => (
        <li key={vol.id}>
          <MobileCard
            id={vol.id} kind="volume"
            label={volumeLabel(vol.number)} subtitle={chapterRangeLabel(vol.startChapter, vol.endChapter)}
            coverUrl={vol.coverUrl} isCompleted={completed.has(vol.id)} accentColor={accent}
            onToggle={onToggle} onCompleteUpTo={onCompleteUpTo}
          />
        </li>
      ))}
    </ol>
  );

  const tabs: Array<{ key: Tab; label: string; count?: string }> = [
    { key: 'both', label: '비교 보기' },
    { key: 'episode', label: '에피소드', count: `${epDone}/${data.episodes.length}` },
    { key: 'volume', label: '단행본', count: `${volDone}/${data.volumes.length}` },
  ];

  return (
    <section className="px-4 pt-6 pb-8" aria-labelledby="tracker-title">
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between gap-3 mb-3 text-left"
        aria-expanded={expanded}
        aria-controls="mobile-tracker"
      >
        <span>
          <span id="tracker-title" className="block text-xl font-bold text-zinc-100">My Progress Tracker</span>
          <span className="block text-sm text-zinc-500 mt-0.5">탭으로 체크 · 길게 누르면 그 항목까지 모두 완료</span>
        </span>
        <span
          className="flex items-center justify-center w-10 h-10 rounded-full border-2 flex-shrink-0 transition-colors"
          style={{
            borderColor: expanded ? accent : 'rgba(82,82,91,0.5)',
            backgroundColor: expanded ? withAlpha(accent, 0.08) : 'transparent',
            color: expanded ? accent : '#9ca3af',
          }}
        >
          <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          <span className="sr-only">{expanded ? '접기' : '펼치기'}</span>
        </span>
      </button>

      <div className="flex gap-2 mb-3">
        {[
          { icon: <Film className="w-4 h-4 flex-shrink-0" style={{ color: accent }} />, done: epDone, total: data.episodes.length, color: accent },
          { icon: <BookOpen className="w-4 h-4 flex-shrink-0 text-zinc-400" />, done: volDone, total: data.volumes.length, color: '#a1a1aa' },
        ].map(({ icon, done, total, color }, i) => (
          <div
            key={i}
            className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border"
            style={i === 0 ? { borderColor: withAlpha(accent, 0.2), backgroundColor: withAlpha(accent, 0.03) } : { borderColor: 'rgba(82,82,91,0.3)', backgroundColor: 'rgba(39,39,42,0.4)' }}
          >
            {icon}
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: color }} />
            </div>
            <span className="text-sm font-mono text-zinc-400 flex-shrink-0 tabular-nums">{done}/{total}</span>
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id="mobile-tracker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div role="tablist" aria-label="보기 방식" className="sticky z-20 flex bg-zinc-900/95 backdrop-blur rounded-xl p-1 gap-1 mb-4 border border-zinc-800" style={{ top: 64 }}>
              {tabs.map(({ key, label, count }) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className="flex-1 min-w-0 py-2 px-1 text-[13px] font-semibold rounded-lg transition-colors whitespace-nowrap"
                  style={tab === key ? { backgroundColor: withAlpha(accent, 0.15), color: accent } : { color: '#a1a1aa' }}
                >
                  {label}
                  {count && <span className="ml-1 font-mono text-[12px] opacity-80 tabular-nums">{count}</span>}
                </button>
              ))}
            </div>
            {tab === 'both' && comparison}
            {tab === 'episode' && episodeList}
            {tab === 'volume' && volumeList}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
