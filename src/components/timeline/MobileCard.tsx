// src/components/timeline/MobileCard.tsx
import { memo, useRef, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { withAlpha } from '../../lib/color';
import type { MediaKind } from '../../types';

const LONG_PRESS_DELAY = 500;
/** 손가락이 이만큼 움직이면 스크롤로 보고 롱프레스를 취소한다 */
const MOVE_TOLERANCE = 10;

interface MobileCardProps {
  id: string;
  kind: MediaKind;
  label: string;
  subtitle: string;
  coverUrl: string | null;
  isCompleted: boolean;
  accentColor: string;
  /** 지정하면 절대 위치(비교 보기), 없으면 일반 흐름(목록 보기) */
  box?: { top: number; height: number; left: number };
  onToggle: (id: string) => void;
  onCompleteUpTo: (kind: MediaKind, id: string) => void;
}

export const MobileCard = memo(function MobileCard({
  id, kind, label, subtitle, coverUrl, isCompleted, accentColor, box, onToggle, onCompleteUpTo,
}: MobileCardProps) {
  const timer = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };

  const style: CSSProperties = {
    borderColor: isCompleted ? accentColor : 'rgba(82,82,91,0.35)',
    backgroundColor: isCompleted ? withAlpha(accentColor, 0.07) : 'rgba(39,39,42,0.7)',
    ...(box ? { top: box.top, height: box.height, left: box.left } : {}),
  };

  return (
    <button
      type="button"
      id={`card-${id}`}
      aria-pressed={isCompleted}
      aria-label={`${label} (${subtitle})${isCompleted ? ' — 완료됨' : ''}`}
      className={`no-callout ${box ? 'absolute right-0' : 'relative w-full h-14'} block text-left rounded-xl border-2 overflow-hidden select-none transition-[opacity,transform] active:opacity-70 active:scale-[0.99]`}
      style={style}
      onTouchStart={(e) => {
        fired.current = false;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        timer.current = window.setTimeout(() => {
          fired.current = true;
          start.current = null;
          navigator.vibrate?.(40);
          onCompleteUpTo(kind, id);
        }, LONG_PRESS_DELAY);
      }}
      onTouchMove={(e) => {
        const origin = start.current;
        if (!origin) return;
        const t = e.touches[0];
        if (Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > MOVE_TOLERANCE) cancel();
      }}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onToggle(id);
      }}
    >
      {coverUrl && (
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${coverUrl}")`, opacity: isCompleted ? 0.25 : 0.12 }}
          aria-hidden="true"
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 to-transparent" aria-hidden="true" />
      <span className={`relative z-10 px-2.5 h-full flex ${box ? 'flex-col justify-end py-2' : 'items-center gap-3'}`}>
        <span className="text-sm font-bold truncate leading-tight" style={{ color: isCompleted ? accentColor : '#f4f4f5' }}>
          {label}
        </span>
        <span className={`text-xs text-zinc-400 truncate ${box ? 'mt-0.5' : ''}`}>{subtitle}</span>
      </span>
      {isCompleted && (
        <CheckCircle2
          className={`absolute z-10 w-4 h-4 ${box ? 'top-2 right-2' : 'top-1/2 -translate-y-1/2 right-3'}`}
          style={{ color: accentColor }}
          aria-hidden="true"
        />
      )}
    </button>
  );
});
