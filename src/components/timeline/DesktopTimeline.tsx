// src/components/timeline/DesktopTimeline.tsx
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHoverMapping } from '../../hooks/useHoverMapping';
import { withAlpha } from '../../lib/color';
import { placeSpan } from '../../lib/timelineLayout';
import { chapterRangeLabel, episodeLabel, volumeLabel } from '../../lib/progress';
import { TimelineNode } from './TimelineNode';
import { useLayout, useTimelineModel } from './model';
import type { TimelineProps } from './Timeline';

const GAP = 8;
const MIN_EPISODE_WIDTH = 150;
const MIN_VOLUME_WIDTH = 230;
/** 이 거리 이상 움직이면 클릭이 아니라 드래그 스크롤로 본다 */
const DRAG_THRESHOLD = 6;

export const DesktopTimeline = ({ data, completedIds, onToggle, onCompleteUpTo }: TimelineProps) => {
  const accent = data.series.accentColor;
  const model = useTimelineModel(data);
  const layout = useLayout(model, MIN_EPISODE_WIDTH, MIN_VOLUME_WIDTH);
  const place = (s: number, e: number) => placeSpan(layout, s, e, MIN_EPISODE_WIDTH, GAP);
  const { hoveredId, related, handleEpisodeHover, handleVolumeHover } = useHoverMapping(data.episodes, data.volumes);
  const completed = new Set(completedIds);

  // ── 드래그 스크롤 (마우스 전용 — 터치/트랙패드는 기본 스크롤을 그대로 쓴다) ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; scrollLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener('resize', updateEdges);
    return () => window.removeEventListener('resize', updateEdges);
  }, [updateEdges, layout.total]);

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !scrollRef.current) return;
    drag.current = { x: e.clientX, scrollLeft: scrollRef.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const state = drag.current;
    const el = scrollRef.current;
    if (!state || !el) return;
    const dx = e.clientX - state.x;
    if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!state.moved) {
      state.moved = true;
      setIsDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    el.scrollLeft = state.scrollLeft - dx;
  };
  const endDrag = () => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
    setIsDragging(false);
  };
  // 드래그로 끝난 제스처의 click 은 노드까지 가지 않도록 캡처 단계에서 막는다.
  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const badge = (text: string, extra = '') => (
    <div
      className={`flex items-center gap-2 px-4 py-1.5 bg-zinc-800/95 backdrop-blur-md border rounded-full text-xs font-bold shadow-lg ${extra}`}
      style={{ borderColor: withAlpha(accent, 0.25), color: accent }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }} />
      {text}
    </div>
  );

  const edgeButton = (direction: 1 | -1) => {
    const visible = direction === 1 ? edges.right : edges.left;
    return (
      <>
        <div
          className={`pointer-events-none absolute inset-y-0 ${direction === 1 ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r'} w-20 from-zinc-900 to-transparent z-30 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        />
        <button
          onClick={() => scrollByPage(direction)}
          tabIndex={visible ? 0 : -1}
          aria-hidden={!visible}
          aria-label={direction === 1 ? '타임라인 오른쪽으로' : '타임라인 왼쪽으로'}
          className={`absolute top-1/2 -translate-y-1/2 ${direction === 1 ? 'right-2' : 'left-2'} z-40 w-10 h-10 rounded-full border border-zinc-700 bg-zinc-800/90 backdrop-blur text-zinc-200 shadow-lg flex items-center justify-center transition-all hover:bg-zinc-700 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {direction === 1 ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </>
    );
  };

  return (
    <section className="w-full bg-zinc-900" aria-labelledby="tracker-title">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h2 id="tracker-title" className="text-2xl font-bold text-zinc-100 mb-2">My Progress Tracker</h2>
          <p className="text-zinc-400">
            에피소드나 단행본을 클릭해 완료를 체크하세요.{' '}
            <span className="text-zinc-500">우클릭하면 그 항목까지 모두 완료 · 드래그로 스크롤</span>
          </p>
        </div>

        <div className="relative">
          {edgeButton(-1)}
          {edgeButton(1)}
          <div
            ref={scrollRef}
            role="region"
            aria-label="타임라인 스크롤 영역"
            onScroll={updateEdges}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={onClickCapture}
            className={`overflow-x-auto custom-scrollbar pb-10 pt-8 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            style={{ '--scrollbar-color': accent } as React.CSSProperties}
          >
            <div className="relative space-y-32 pt-12" style={{ width: layout.total, minHeight: 350 }}>
              <div className="relative h-28">
                {model.seasons.map((season) => {
                  const { pos, dim } = place(season.actualStart, season.actualEnd);
                  return (
                    <div key={season.id} className="absolute -top-10 h-full pointer-events-none z-30" style={{ left: pos, width: dim }}>
                      <div className="sticky left-4 top-0 w-max">{badge(season.name)}</div>
                    </div>
                  );
                })}
                {model.episodes.map((ep) => {
                  const { pos, dim } = place(ep.actualStart, ep.actualEnd);
                  return (
                    <TimelineNode
                      key={ep.id}
                      id={ep.id}
                      kind="episode"
                      label={episodeLabel(ep.number)}
                      subtitle={chapterRangeLabel(ep.startChapter, ep.endChapter)}
                      isHovered={hoveredId === ep.id}
                      isRelated={related.has(ep.id)}
                      isCompleted={completed.has(ep.id)}
                      accentColor={accent}
                      width={dim}
                      left={pos}
                      coverUrl={ep.coverUrl}
                      onHover={handleEpisodeHover}
                      onToggle={onToggle}
                      onCompleteUpTo={onCompleteUpTo}
                    >
                      {ep.duration ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white shadow-sm">{ep.duration}m</span>
                      ) : null}
                    </TimelineNode>
                  );
                })}
              </div>

              <div className="relative h-28">
                <div className="absolute -top-10 h-full pointer-events-none z-30" style={{ left: 0, width: layout.total }}>
                  <div className="sticky left-4 top-0 w-max">{badge('MANGA VOLUMES', 'tracking-widest')}</div>
                </div>
                {model.volumes.map((vol) => {
                  const { pos, dim } = place(vol.actualStart, vol.actualEnd);
                  return (
                    <TimelineNode
                      key={vol.id}
                      id={vol.id}
                      kind="volume"
                      label={volumeLabel(vol.number)}
                      subtitle={chapterRangeLabel(vol.startChapter, vol.endChapter)}
                      isHovered={hoveredId === vol.id}
                      isRelated={related.has(vol.id)}
                      isCompleted={completed.has(vol.id)}
                      accentColor={accent}
                      width={dim}
                      left={pos}
                      coverUrl={vol.coverUrl}
                      onHover={handleVolumeHover}
                      onToggle={onToggle}
                      onCompleteUpTo={onCompleteUpTo}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
