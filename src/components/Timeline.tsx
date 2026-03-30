// src/components/Timeline.tsx
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState, useMemo, useCallback } from 'react';
import { Plus, Minus, CheckCircle2, Film, BookOpen } from 'lucide-react';
import { TimelineNode } from './TimelineNode';
import { useHoverMapping } from '../hooks/useHoverMapping';
import type { TimelineData, ProcessedItem, ProcessedSeason, Episode, Volume, Season } from '../types';

// ── 상수 ─────────────────────────────────────────────────────────────────────
const PC_GAP           = 8;
const MOBILE_GAP       = 4;
const SEASON_BAR_W     = 3;
const SEASON_INDENT_W  = 16;
const MIN_ANIME_WIDTH  = 150;
const MIN_MANGA_WIDTH  = 230;
const MIN_MOBILE_EP_H  = 64;
const MIN_MOBILE_VOL_H = 92;
const LONG_PRESS_DELAY = 500;



interface TimelineProps {
  data: TimelineData;
  accentColor: string;
  completedIds: string[];
  onToggleComplete: (id: string) => void;
  onRightClickComplete: (type: 'episode' | 'volume', id: string) => void;
}

// ── 공통 처리 함수 ────────────────────────────────────────────────────────────
function buildProcessedItems(items: Episode[] | Volume[]): ProcessedItem[] {
  if (!items?.length) return [];
  const valid = items.filter((item) => item.endChapter != null);
  return valid.map((item, i, arr) => {
    let start = Number(item.startChapter);
    let end   = Number(item.endChapter) + 1;
    if (i > 0 && Number(arr[i - 1].endChapter) === start) start += 0.5;
    if (i < arr.length - 1 && Number(arr[i + 1].startChapter) === Number(item.endChapter)) end -= 0.5;
    return { ...(item as unknown as ProcessedItem), actualStart: start, actualEnd: end };
  });
}

function buildProcessedSeasons(items: Season[]): ProcessedSeason[] {
  if (!items?.length) return [];
  const valid = items.filter((item) => item.endChapter != null);
  return valid.map((item, i, arr) => {
    let start = Number(item.startChapter);
    let end   = Number(item.endChapter!) + 1;
    if (i > 0 && Number(arr[i - 1].endChapter) === start) start += 0.5;
    if (i < arr.length - 1 && Number(arr[i + 1].startChapter) === Number(item.endChapter)) end -= 0.5;
    return { ...(item as unknown as ProcessedSeason), actualStart: start, actualEnd: end };
  });
}

function buildSegmentOffsets(
  milestones: number[],
  episodes: ProcessedItem[],
  volumes: ProcessedItem[],
  minEpUnit: number,
  minVolUnit: number,
): { offsets: number[]; total: number } {
  if (milestones.length === 0) return { offsets: [], total: 0 };
  const widths = new Array<number>(milestones.length - 1).fill(0);
  for (let i = 0; i < milestones.length - 1; i++) {
    const segStart = milestones[i], segEnd = milestones[i + 1], segLen = segEnd - segStart;
    let max = 0;
    episodes.forEach((ep) => {
      if (ep.actualStart <= segStart && ep.actualEnd >= segEnd)
        max = Math.max(max, (segLen / (ep.actualEnd - ep.actualStart)) * minEpUnit);
    });
    volumes.forEach((vol) => {
      if (vol.actualStart <= segStart && vol.actualEnd >= segEnd)
        max = Math.max(max, (segLen / (vol.actualEnd - vol.actualStart)) * minVolUnit);
    });
    widths[i] = max || minEpUnit;
  }
  const offsets = [0];
  let cur = 0;
  widths.forEach((w) => { cur += w; offsets.push(cur); });
  return { offsets, total: cur };
}

function getPosDim(
  actualStart: number,
  actualEnd: number,
  milestones: number[],
  offsets: number[],
  fallbackDim: number,
  gap: number,
): { pos: number; dim: number } {
  const si = milestones.indexOf(actualStart);
  const ei = milestones.indexOf(actualEnd);
  if (si === -1 || ei === -1 || si >= ei)
    return { pos: si !== -1 ? (offsets[si] ?? 0) : 0, dim: fallbackDim - gap };
  return { pos: offsets[si], dim: offsets[ei] - offsets[si] - gap };
}

// ── 모바일 카드 ───────────────────────────────────────────────────────────────
interface MobileCardProps {
  id: string;
  label: string;
  subtitle: string;
  coverUrl?: string;
  isCompleted: boolean;
  accentColor: string;
  top: number;
  height: number;
  indented?: boolean;
  onTap: (id: string) => void;
  onLongPress: (id: string) => void;
}

const MobileCard = ({
  id, label, subtitle, coverUrl, isCompleted,
  accentColor, top, height, indented = false, onTap, onLongPress,
}: MobileCardProps) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const handleTouchStart = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress(id);
      if (navigator.vibrate) navigator.vibrate(40);
    }, LONG_PRESS_DELAY);
  };
  const handleTouchEnd = () => { if (timer.current) clearTimeout(timer.current); };
  const handleClick    = () => { if (!fired.current) onTap(id); };

  const left = indented ? SEASON_INDENT_W : 0;

  return (
    <div
      className="absolute right-0 rounded-xl border-2 overflow-hidden cursor-pointer select-none active:opacity-70 transition-opacity"
      style={{
        top:    `${top}px`,
        height: `${height}px`,
        left:   `${left}px`,
        borderColor:     isCompleted ? accentColor : 'rgba(82,82,91,0.35)',
        backgroundColor: isCompleted ? `${accentColor}12` : 'rgba(39,39,42,0.7)',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={handleClick}
    >
      {coverUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${coverUrl}")`, opacity: isCompleted ? 0.25 : 0.12 }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" />
      <div className="relative z-10 p-2.5 h-full flex flex-col justify-end">
        {isCompleted && (
          <CheckCircle2 className="absolute top-2 right-2 w-4 h-4" style={{ color: accentColor }} />
        )}
        <p className="text-sm font-bold truncate leading-tight" style={{ color: isCompleted ? accentColor : '#f4f4f5' }}>
          {label}
        </p>
        <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
};

// ── 시즌 바 오버레이 (에피소드 컬럼 전용) ─────────────────────────────────────
interface SeasonBarProps {
  seasons: ProcessedSeason[];
  milestones: number[];
  offsets: number[];
  totalHeight: number;
  accentColor: string;
}

const SeasonBars = ({ seasons, milestones, offsets, accentColor }: Omit<SeasonBarProps, 'totalHeight'> & { totalHeight?: number }) => {
  if (!seasons.length) return null;

  const opacities = [1, 0.55, 0.8, 0.45, 0.7];

  return (
    <div className="absolute top-0 left-0 bottom-0 pointer-events-none" style={{ width: `${SEASON_INDENT_W}px` }}>
      {seasons.map((season, idx) => {
        const { pos, dim } = getPosDim(season.actualStart, season.actualEnd, milestones, offsets, MIN_MOBILE_EP_H, MOBILE_GAP);
        const opacity = opacities[idx % opacities.length];

        return (
          // 이 div가 시즌 구간 전체 높이를 잡아서 sticky의 경계를 결정
          <div
            key={idx}
            className="absolute"
            style={{ top: `${pos}px`, height: `${dim}px`, left: 0, width: `${SEASON_INDENT_W}px` }}
          >
            {/* 세로 바 전체 — 배지 뒤에서도 연속으로 흐름 */}
            <div
              className="absolute rounded-full"
              style={{
                top:             0,
                bottom:          0,
                width:           `${SEASON_BAR_W}px`,
                left:            0,
                backgroundColor: accentColor,
                opacity,
              }}
            />

            {/* sticky 배지 — 스크롤해도 시즌 구간 안에서 따라다님 */}
            <div
              className="sticky"
              style={{ top: '72px' }} // 헤더 + 탭 높이 고려
            >
              {/* 배지 — 바를 "꿰는" 형태: 배경이 바를 시각적으로 끊음 */}
              <div
                className="absolute flex items-center justify-center rounded-sm"
                style={{
                  // 바 중앙(1.5px)에 배지를 수평 중앙 정렬
                  left:            `${SEASON_BAR_W / 2}px`,
                  transform:       'translateX(-50%)',
                  top:             '4px',
                  width:           `${SEASON_INDENT_W - 2}px`,
                  padding:         '3px 2px',
                  backgroundColor: '#09090b', // zinc-950 — 바를 덮어서 꼬치 효과
                  border:          `1px solid ${accentColor}`,
                  opacity,
                  zIndex:          10,
                }}
              >
                <span
                  className="font-black"
                  style={{
                    color:           accentColor,
                    fontSize:        '9px',
                    writingMode:     'vertical-rl',
                    textOrientation: 'mixed',
                    lineHeight:      1,
                    letterSpacing:   '0.05em',
                  }}
                >
                  {season.name}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export const Timeline = ({
  data, accentColor, completedIds, onToggleComplete, onRightClickComplete,
}: TimelineProps) => {
  const {
    hoveredEpisodeId, hoveredVolumeId,
    relatedVolumes, relatedEpisodes,
    handleEpisodeHover, handleVolumeHover,
  } = useHoverMapping(data);

  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [mobileTab, setMobileTab] = useState<'both' | 'episode' | 'volume'>('both');

  // PC 드래그 스크롤
  const scrollRef  = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX]         = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const onMouseDown  = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  const onMouseLeave = () => setIsDragging(false);
  const onMouseUp    = () => setIsDragging(false);
  const onMouseMove  = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    scrollRef.current.scrollLeft = scrollLeft - (e.pageX - scrollRef.current.offsetLeft - startX) * 1.5;
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.touches[0].pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };
  const onTouchEnd  = () => setIsDragging(false);
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || !scrollRef.current) return;
    scrollRef.current.scrollLeft = scrollLeft - (e.touches[0].pageX - scrollRef.current.offsetLeft - startX) * 1.5;
  };

  // 공통 데이터
  const processedEpisodes = useMemo(() => buildProcessedItems(data.episodes ?? []), [data.episodes]);
  const processedVolumes  = useMemo(() => buildProcessedItems(data.volumes  ?? []), [data.volumes]);
  const processedSeasons  = useMemo(() => buildProcessedSeasons(data.seasons ?? []), [data.seasons]);

  const milestones = useMemo(() => {
    const pts = new Set<number>();
    [...processedSeasons, ...processedEpisodes, ...processedVolumes].forEach((item) => {
      pts.add(item.actualStart); pts.add(item.actualEnd);
    });
    return Array.from(pts).sort((a, b) => a - b);
  }, [processedSeasons, processedEpisodes, processedVolumes]);

  const { offsets: pcOffsets, total: pcTotal } = useMemo(
    () => buildSegmentOffsets(milestones, processedEpisodes, processedVolumes, MIN_ANIME_WIDTH, MIN_MANGA_WIDTH),
    [milestones, processedEpisodes, processedVolumes],
  );

  const { offsets: mbOffsets, total: mbTotal } = useMemo(
    () => buildSegmentOffsets(milestones, processedEpisodes, processedVolumes, MIN_MOBILE_EP_H, MIN_MOBILE_VOL_H),
    [milestones, processedEpisodes, processedVolumes],
  );

  const getPcPosDim = useCallback(
    (s: number, e: number) => getPosDim(s, e, milestones, pcOffsets, MIN_ANIME_WIDTH, PC_GAP),
    [milestones, pcOffsets],
  );
  const getMbPosDim = useCallback(
    (s: number, e: number) => getPosDim(s, e, milestones, mbOffsets, MIN_MOBILE_EP_H, MOBILE_GAP),
    [milestones, mbOffsets],
  );

  const hasSeason = processedSeasons.length > 0;

  const badgeStyle = {
    container: { borderColor: `${accentColor}40`, color: accentColor },
    dot:       { backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` },
  };

  const handleMobileLongPress = useCallback(
    (type: 'episode' | 'volume', id: string) => onRightClickComplete(type, id),
    [onRightClickComplete],
  );

  const epDone  = (data.episodes ?? []).filter((e) => completedIds.includes(e.id)).length;
  const volDone = (data.volumes  ?? []).filter((v) => completedIds.includes(v.id)).length;

  // ── 모바일 컬럼 ──────────────────────────────────────────────────────────
  const EpisodeColumn = (
    // 시즌 바가 있을 때 왼쪽에 공간 확보
    <div className="relative w-full" style={{ height: `${mbTotal}px`, paddingLeft: hasSeason ? `${SEASON_INDENT_W}px` : '0' }}>
      {/* 시즌 바 오버레이 */}
      {hasSeason && (
        <SeasonBars
          seasons={processedSeasons}
          milestones={milestones}
          offsets={mbOffsets}
          totalHeight={mbTotal}
          accentColor={accentColor}
        />
      )}
      {processedEpisodes.map((ep) => {
        const { pos, dim } = getMbPosDim(ep.actualStart, ep.actualEnd);
        return (
          <MobileCard
            key={ep.id}
            id={ep.id}
            label={`Ep ${ep.number ?? ''}`}
            subtitle={`Ch ${ep.startChapter}–${ep.endChapter}`}
            coverUrl={ep.cover_url ?? ep.coverUrl ?? undefined}
            isCompleted={completedIds.includes(ep.id)}
            accentColor={accentColor}
            top={pos}
            height={dim}
            indented={hasSeason}
            onTap={onToggleComplete}
            onLongPress={(id) => handleMobileLongPress('episode', id)}
          />
        );
      })}
    </div>
  );

  const VolumeColumn = (
    <div className="relative w-full" style={{ height: `${mbTotal}px` }}>
      {processedVolumes.map((vol) => {
        const { pos, dim } = getMbPosDim(vol.actualStart, vol.actualEnd);
        return (
          <MobileCard
            key={vol.id}
            id={vol.id}
            label={`Vol ${vol.number ?? ''}`}
            subtitle={`Ch ${vol.startChapter}–${vol.endChapter}`}
            coverUrl={vol.cover_url ?? vol.coverUrl ?? undefined}
            isCompleted={completedIds.includes(vol.id)}
            accentColor={accentColor}
            top={pos}
            height={dim}
            onTap={onToggleComplete}
            onLongPress={(id) => handleMobileLongPress('volume', id)}
          />
        );
      })}
    </div>
  );

  // ── 모바일 UI ─────────────────────────────────────────────────────────────
  const mobileTimeline = (
    <div className="md:hidden px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-gray-100">My Progress Tracker</h2>
          <p className="text-sm text-zinc-500 mt-0.5">탭으로 체크 · 롱프레스로 이전 전체 완료</p>
        </div>
        <button
          onClick={() => setMobileExpanded((v) => !v)}
          className="flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all active:scale-95"
          style={{
            borderColor:     mobileExpanded ? accentColor : 'rgba(82,82,91,0.5)',
            backgroundColor: mobileExpanded ? `${accentColor}15` : 'transparent',
            color:           mobileExpanded ? accentColor : '#9ca3af',
          }}
          aria-label={mobileExpanded ? '접기' : '펼치기'}
        >
          {mobileExpanded ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>
      </div>

      {/* 미니 진도 요약 */}
      <div className="flex gap-2 mb-3">
        {[
          { icon: <Film className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />, done: epDone,  total: (data.episodes ?? []).length, color: accentColor,  bgStyle: { borderColor: `${accentColor}30`, backgroundColor: `${accentColor}08` } },
          { icon: <BookOpen className="w-4 h-4 flex-shrink-0 text-zinc-400" />,             done: volDone, total: (data.volumes  ?? []).length, color: '#a1a1aa', bgStyle: { borderColor: 'rgba(82,82,91,0.3)', backgroundColor: 'rgba(39,39,42,0.4)' } },
        ].map(({ icon, done, total, color, bgStyle }, i) => (
          <div key={i} className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border" style={bgStyle}>
            {icon}
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total ? done / total * 100 : 0}%`, backgroundColor: color }} />
            </div>
            <span className="text-sm font-mono text-zinc-400 flex-shrink-0">{done}/{total}</span>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {mobileExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* 탭 */}
            <div className="flex bg-zinc-900 rounded-xl p-1 gap-1 mb-4 border border-zinc-800">
              {([
                { key: 'both',    label: '비교 보기' },
                { key: 'episode', label: `에피소드 (${epDone}/${(data.episodes ?? []).length})` },
                { key: 'volume',  label: `단행본 (${volDone}/${(data.volumes ?? []).length})` },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMobileTab(key)}
                  className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
                  style={mobileTab === key
                    ? { backgroundColor: `${accentColor}25`, color: accentColor }
                    : { color: '#71717a' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {mobileTab === 'both' && (
              <div>
                <div className="flex gap-2 mb-2">
                  <p className="flex-1 text-xs font-bold tracking-widest uppercase flex items-center gap-1" style={{ color: accentColor }}>
                    <Film className="w-3.5 h-3.5" /> ANIME
                  </p>
                  <p className="flex-1 text-xs font-bold tracking-widest uppercase text-zinc-400 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" /> MANGA
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {EpisodeColumn}
                  {VolumeColumn}
                </div>
              </div>
            )}

            {mobileTab === 'episode' && (
              <div>
                <p className="text-xs font-bold tracking-widest uppercase mb-3 flex items-center gap-1" style={{ color: accentColor }}>
                  <Film className="w-3.5 h-3.5" /> ANIME EPISODES
                </p>
                {EpisodeColumn}
              </div>
            )}

            {mobileTab === 'volume' && (
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-3 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> MANGA VOLUMES
                </p>
                {VolumeColumn}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── PC 타임라인 (기존 완전 유지) ─────────────────────────────────────────
  const desktopTimeline = (
    <div className="hidden md:block w-full bg-zinc-900 transition-colors duration-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold text-gray-100 mb-2">My Progress Tracker</h2>
          <p className="text-gray-400">에피소드나 단행본을 클릭하여 시청/독서 완료를 체크해보세요!</p>
        </motion.div>

        <div className="relative">
          <div
            ref={scrollRef}
            role="region"
            aria-label="타임라인 스크롤 영역"
            onMouseDown={onMouseDown}
            onMouseLeave={onMouseLeave}
            onMouseUp={onMouseUp}
            onMouseMove={onMouseMove}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchMove={onTouchMove}
            className={`overflow-x-auto custom-scrollbar pb-12 pt-8 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ '--scrollbar-color': accentColor } as React.CSSProperties}
          >
            <div className="relative space-y-32 pt-12" style={{ width: `${pcTotal}px`, minHeight: '350px' }}>
              <div className="relative h-28">
                {processedSeasons.map((season, idx) => {
                  const { pos: left, dim: width } = getPcPosDim(season.actualStart, season.actualEnd);
                  return (
                    <div key={idx} className="absolute -top-10 h-full pointer-events-none z-30" style={{ left, width }}>
                      <div className="sticky left-4 top-0 w-max">
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800/95 backdrop-blur-md border rounded-full text-xs font-bold shadow-lg" style={badgeStyle.container}>
                          <span className="w-2 h-2 rounded-full" style={badgeStyle.dot} />
                          {season.name}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {processedEpisodes.map((ep) => {
                  const { pos: left, dim: width } = getPcPosDim(ep.actualStart, ep.actualEnd);
                  const epNum = String(ep.number);
                  const label = epNum.toLowerCase().includes('movie') || epNum.includes('ova') ? epNum : `Ep ${epNum}`;
                  return (
                    <TimelineNode
                      key={ep.id} id={ep.id} label={label}
                      subtitle={`Ch ${ep.startChapter}-${ep.endChapter}`}
                      isHovered={hoveredEpisodeId === ep.id}
                      isRelated={relatedEpisodes.includes(ep.id)}
                      isCompleted={completedIds.includes(ep.id)}
                      accentColor={accentColor} width={width} left={left}
                      onHover={handleEpisodeHover}
                      onClick={onToggleComplete}
                      onRightClick={(id) => onRightClickComplete('episode', id)}
                      coverUrl={ep.cover_url ?? ep.coverUrl ?? undefined}
                    >
                      {ep.duration && (
                        <div className="text-[10px] mt-1 px-1.5 py-0.5 rounded w-fit bg-black/60 text-white shadow-sm">
                          {ep.duration}m
                        </div>
                      )}
                    </TimelineNode>
                  );
                })}
              </div>

              <div className="relative h-28">
                <div className="absolute -top-10 h-full pointer-events-none z-30" style={{ left: 0, width: pcTotal }}>
                  <div className="sticky left-4 top-0 w-max">
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-zinc-800/95 backdrop-blur-md border rounded-full text-xs font-bold shadow-lg tracking-widest" style={badgeStyle.container}>
                      <span className="w-2 h-2 rounded-full" style={badgeStyle.dot} />
                      MANGA VOLUMES
                    </div>
                  </div>
                </div>
                {processedVolumes.map((vol) => {
                  const { pos: left, dim: width } = getPcPosDim(vol.actualStart, vol.actualEnd);
                  return (
                    <TimelineNode
                      key={vol.id} id={vol.id} label={`Vol ${vol.number}`}
                      subtitle={`Ch ${vol.startChapter}-${vol.endChapter}`}
                      isHovered={hoveredVolumeId === vol.id}
                      isRelated={relatedVolumes.includes(vol.id)}
                      isCompleted={completedIds.includes(vol.id)}
                      accentColor={accentColor} width={width} left={left}
                      onHover={handleVolumeHover}
                      onClick={onToggleComplete}
                      onRightClick={(id) => onRightClickComplete('volume', id)}
                      coverUrl={vol.cover_url ?? vol.coverUrl ?? undefined}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileTimeline}
      {desktopTimeline}
    </>
  );
};