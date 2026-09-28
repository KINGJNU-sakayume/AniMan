// src/components/SocialCard.tsx
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { withAlpha } from '../lib/color';
import type { ProgressSummary } from '../lib/progress';
import type { Series } from '../types';

interface SocialCardProps {
  series: Series;
  progress: ProgressSummary;
  onClose: () => void;
}

/**
 * 인스타그램 스토리(9:16) 비율 공유 카드. 카드 크기는 화면에 맞춰 줄어들고(.story-card),
 * 내부 글자도 cqw 단위로 함께 줄어 작은 폰/가로 화면에서도 잘리지 않는다.
 */
export const SocialCard = ({ series, progress, onClose }: SocialCardProps) => {
  const accent = series.accentColor;
  // 세로 카드이므로 표지(세로 이미지)를 우선 사용
  const image = series.coverUrl ?? series.bannerUrl;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const stats = [
    ['ANIME WATCHED', progress.episodes.percent],
    ['MANGA SYNC', progress.volumes.percent],
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4"
      role="dialog"
      aria-modal="true"
      aria-label="진도 공유 카드"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="story-card relative flex justify-end w-full">
          <button
            ref={closeRef}
            onClick={onClose}
            className="p-2.5 bg-zinc-800 rounded-full text-white hover:bg-zinc-700 transition-colors shadow-lg"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="story-card story-card-body rounded-[2rem] overflow-hidden shadow-2xl relative"
          style={{
            backgroundColor: '#0a0a14',
            border: `1.5px solid ${accent}`,
            boxShadow: `0 0 0 1px ${withAlpha(accent, 0.2)}, inset 0 0 40px ${withAlpha(accent, 0.03)}`,
          }}
        >
          <div className="relative z-[4]" style={{ height: 3, background: `linear-gradient(to right, transparent, ${accent}, transparent)` }} />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              top: '20%', left: '50%', transform: 'translateX(-50%)', width: '33cqw', height: '33cqw',
              background: `radial-gradient(circle, ${withAlpha(accent, 0.2)} 0%, transparent 70%)`,
            }}
          />
          {image && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale" />}
          <div
            className="absolute inset-0 z-[1]"
            style={{ background: `linear-gradient(180deg, ${withAlpha(accent, 0.1)} 0%, ${withAlpha(accent, 0.02)} 60%, transparent 100%)` }}
          />
          <div className="absolute inset-0 z-[2] bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 z-[3]" style={{ padding: '8.9cqw' }}>
            <p className="text-zinc-400 font-black uppercase" style={{ fontSize: '2.8cqw', letterSpacing: '0.3em' }}>
              AniMan Journey
            </p>
            <h2
              className="font-black tracking-tighter leading-tight text-white drop-shadow-md whitespace-pre-line"
              style={{ fontSize: '10cqw', marginTop: '2.2cqw' }}
            >
              {series.title}
            </h2>
            <div className="grid grid-cols-2" style={{ gap: '3.3cqw', marginTop: '6.7cqw' }}>
              {stats.map(([label, percent]) => (
                <div
                  key={label}
                  className="backdrop-blur-md"
                  style={{
                    backgroundColor: withAlpha(accent, 0.07),
                    border: `0.5px solid ${withAlpha(accent, 0.2)}`,
                    borderRadius: '4.4cqw',
                    padding: '4.4cqw',
                  }}
                >
                  <p className="font-bold" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '2.4cqw', letterSpacing: '0.06em' }}>
                    {label}
                  </p>
                  <p className="font-black tabular-nums" style={{ color: accent, fontSize: '6.7cqw', marginTop: '1.1cqw' }}>
                    {Math.round(percent)}%
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 text-zinc-500 font-bold tracking-widest" style={{ fontSize: '2.8cqw', marginTop: '6.7cqw', paddingTop: '4.4cqw' }}>
              ANIMAN.APP
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-500">스크린샷으로 저장해 스토리에 공유해 보세요</p>
      </div>
    </motion.div>
  );
};
