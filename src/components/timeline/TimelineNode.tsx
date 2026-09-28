// src/components/timeline/TimelineNode.tsx
import { memo, type CSSProperties, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { withAlpha } from '../../lib/color';
import type { MediaKind } from '../../types';

interface TimelineNodeProps {
  id: string;
  kind: MediaKind;
  label: string;
  subtitle: string;
  isHovered: boolean;
  isRelated: boolean;
  isCompleted: boolean;
  accentColor: string;
  width: number;
  left: number;
  coverUrl: string | null;
  onHover: (id: string | null) => void;
  onToggle: (id: string) => void;
  onCompleteUpTo: (kind: MediaKind, id: string) => void;
  children?: ReactNode;
}

export const TimelineNode = memo(function TimelineNode({
  id, kind, label, subtitle, isHovered, isRelated, isCompleted,
  accentColor, width, left, coverUrl, onHover, onToggle, onCompleteUpTo, children,
}: TimelineNodeProps) {
  const isActive = isHovered || isRelated;
  const highlighted = isActive || isCompleted;

  return (
    <div
      id={`node-${id}`}
      role="button"
      tabIndex={0}
      aria-pressed={isCompleted}
      aria-label={`${label} (${subtitle})${isCompleted ? ' — 완료됨' : ''}`}
      title="클릭: 완료 체크 · 우클릭: 여기까지 모두 완료"
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
      onClick={() => onToggle(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onCompleteUpTo(kind, id);
      }}
      className={`timeline-node absolute top-0 group h-full cursor-pointer transition-[opacity,filter] duration-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
        isCompleted || isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
      }`}
      style={{ left, width, '--tw-ring-color': accentColor } as CSSProperties}
    >
      <div
        className={`relative h-full rounded-lg border-2 transition-all duration-300 flex items-center ${
          highlighted ? 'bg-zinc-800/90 shadow-lg z-20' : 'bg-zinc-900/60 hover:bg-zinc-800/80 z-10'
        }`}
        style={{
          borderColor: highlighted ? accentColor : 'rgba(82,82,91,0.13)',
          boxShadow: isActive ? `0 0 20px ${withAlpha(accentColor, 0.25)}` : 'none',
        }}
      >
        {isCompleted && (
          <CheckCircle2 className="absolute top-2 right-2 z-20 w-5 h-5 drop-shadow-md" style={{ color: accentColor }} aria-hidden="true" />
        )}
        {coverUrl && (
          <div
            className={`absolute inset-0 bg-cover bg-center z-0 transition-opacity duration-300 rounded-md ${
              isCompleted ? 'opacity-40' : 'opacity-20 group-hover:opacity-30'
            }`}
            style={{ backgroundImage: `url("${coverUrl}")` }}
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-transparent to-transparent z-0 pointer-events-none rounded-md" />

        <div className="relative z-10 h-full w-full">
          <div className="sticky left-0 flex flex-col justify-center h-full w-max py-3 pr-8 pl-4 max-w-full">
            <div className="font-bold text-sm truncate drop-shadow-md transition-colors duration-300" style={{ color: highlighted ? accentColor : '#e5e7eb' }}>
              {label}
            </div>
            <div className={`text-xs truncate drop-shadow-md mt-1 transition-colors duration-300 ${highlighted ? 'text-white' : 'text-zinc-400'}`}>
              {subtitle}
            </div>
            {children && <div className="mt-2">{children}</div>}
          </div>
        </div>
      </div>
    </div>
  );
});
