// src/components/TimelineNode.tsx
import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface TimelineNodeProps {
  id: string;
  label: string;
  subtitle?: string;
  isHovered: boolean;
  isRelated: boolean;
  isCompleted: boolean;
  accentColor: string;
  width: number;
  left: number;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
  onRightClick?: (id: string) => void;
  children?: ReactNode;
  coverUrl?: string;
}

export const TimelineNode = ({
  id, label, subtitle, isHovered, isRelated, isCompleted,
  accentColor, width, left, onHover, onClick, onRightClick, children, coverUrl,
}: TimelineNodeProps) => {
  const isActive = isHovered || isRelated;

  // M-03: 키보드 접근성 — Enter / Space 키로 클릭 처리
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(id);
    }
  };

  return (
    <motion.div
      id={`node-${id}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(id)}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onRightClick?.(id);
      }}
      // M-03: 접근성 속성 추가
      role="button"
      tabIndex={0}
      aria-pressed={isCompleted}
      aria-label={`${label}${subtitle ? ` (${subtitle})` : ''}${isCompleted ? ' — 완료됨' : ''}`}
      className={`absolute top-0 group h-full cursor-pointer transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 ${
        isCompleted ? 'opacity-100' : 'opacity-60 hover:opacity-100 grayscale hover:grayscale-0'
      }`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        // @ts-expect-error framer-motion ring color
        '--tw-ring-color': accentColor,
      }}
    >
      <div
        className={`relative h-full rounded-lg border-2 transition-all duration-300 flex items-center ${
          isActive || isCompleted
            ? 'bg-zinc-800/90 border-opacity-100 shadow-lg z-20'
            : 'bg-zinc-900/60 border-opacity-20 hover:bg-zinc-800/80 z-10'
        }`}
        style={{
          borderColor: isActive || isCompleted ? accentColor : '#52525b20',
          boxShadow: isActive ? `0 0 20px ${accentColor}40` : 'none',
        }}
      >
        {isCompleted && (
          <div className="absolute top-2 right-2 z-20">
            <CheckCircle2
              className="w-5 h-5 drop-shadow-md"
              style={{ color: accentColor }}
              aria-hidden="true"
            />
          </div>
        )}

        {coverUrl && (
          <div
            className={`absolute inset-0 bg-cover bg-center z-0 transition-opacity duration-300 rounded-lg ${
              isCompleted ? 'opacity-40' : 'opacity-20 group-hover:opacity-30'
            }`}
            style={{ backgroundImage: `url("${coverUrl}")` }}
            aria-hidden="true"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/80 via-transparent to-transparent z-0 pointer-events-none rounded-lg" />

        <div className="relative z-10 h-full w-full">
          <div className="sticky left-0 flex flex-col justify-center h-full w-max py-3 pr-8 pl-4 max-w-full">
            <motion.div
              animate={{ color: isActive || isCompleted ? accentColor : '#e5e7eb' }}
              className="font-bold text-sm truncate drop-shadow-md"
            >
              {label}
            </motion.div>

            {subtitle && (
              <motion.div
                animate={{ color: isActive || isCompleted ? '#fff' : '#9ca3af' }}
                className="text-xs truncate drop-shadow-md mt-1"
              >
                {subtitle}
              </motion.div>
            )}

            <div className="mt-2">{children}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
