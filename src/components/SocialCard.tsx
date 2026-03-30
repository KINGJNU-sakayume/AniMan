// src/components/SocialCard.tsx
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { TimelineData, Series } from '../types';

// I-03: Download 아이콘은 기능 미구현으로 제거 (TS6133 해소)

interface SocialCardProps {
  series: Series;
  data: TimelineData;
  completedIds: string[];
  accentColor: string;
  onClose: () => void;
}

export const SocialCard = ({ series, data, completedIds, accentColor, onClose }: SocialCardProps) => {
  const bannerImage = series.cover_url ?? series.banner_url ?? series.banner_image_url;

  const totalEpisodes = data?.episodes?.length ?? 0;
  const completedEpisodes =
    data?.episodes?.filter((ep) => completedIds.includes(ep.id)).length ?? 0;
  const epPercent = totalEpisodes ? Math.round((completedEpisodes / totalEpisodes) * 100) : 0;

  const totalVolumes = data?.volumes?.length ?? 0;
  const completedVolumes =
    data?.volumes?.filter((vol) => completedIds.includes(vol.id)).length ?? 0;
  const volPercent = totalVolumes ? Math.round((completedVolumes / totalVolumes) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-xl p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="소셜 공유 카드"
    >
      <div className="relative group">
        {/* 인스타그램 스토리 9:16 비율 — Change 5: accent glow frame */}
        <div
          className="w-[320px] h-[568px] sm:w-[360px] sm:h-[640px] rounded-[2rem] overflow-hidden shadow-2xl relative"
          style={{
            backgroundColor: '#0a0a14',
            border: `1.5px solid ${accentColor}`,
            boxShadow: `0 0 0 1px ${accentColor}30, inset 0 0 40px ${accentColor}08`,
          }}
        >
          {/* Change 5: top accent line */}
          <div
            style={{
              height: '3px',
              background: `linear-gradient(to right, transparent, ${accentColor}, transparent)`,
            }}
          />

          {/* Change 5: glow circle behind image */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '120px',
              height: '120px',
              background: `radial-gradient(circle, ${accentColor}30 0%, transparent 70%)`,
              borderRadius: '50%',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />

          {bannerImage && (
            <img
              src={bannerImage}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale"
            />
          )}
          {/* Change 5: accent-tinted overlay on banner */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${accentColor}18 0%, ${accentColor}06 60%, transparent 100%)`,
              zIndex: 1,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" style={{ zIndex: 2 }} />

          <div className="absolute inset-x-0 bottom-0 p-8 space-y-6" style={{ zIndex: 3 }}>
            <div className="space-y-2">
              <p className="text-zinc-400 text-[10px] font-black tracking-[0.3em] uppercase">
                AniMan Journey
              </p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tighter leading-tight text-white drop-shadow-md">
                {series.title}
              </h2>
            </div>

            {/* Change 5: both stat boxes use accent color consistently */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="backdrop-blur-md rounded-2xl p-4"
                style={{
                  backgroundColor: `${accentColor}12`,
                  border: `0.5px solid ${accentColor}30`,
                }}
              >
                <p
                  className="font-bold mb-1"
                  style={{ color: 'rgba(255,255,255,0.45)', fontSize: '8px', letterSpacing: '0.06em' }}
                >
                  ANIME WATCHED
                </p>
                <p className="text-2xl font-black" style={{ color: accentColor }}>
                  {epPercent}%
                </p>
              </div>
              <div
                className="backdrop-blur-md rounded-2xl p-4"
                style={{
                  backgroundColor: `${accentColor}12`,
                  border: `0.5px solid ${accentColor}30`,
                }}
              >
                <p
                  className="font-bold mb-1"
                  style={{ color: 'rgba(255,255,255,0.45)', fontSize: '8px', letterSpacing: '0.06em' }}
                >
                  MANGA SYNC
                </p>
                {/* Change 5: was text-white, now uses accentColor for consistency */}
                <p className="text-2xl font-black" style={{ color: accentColor }}>{volPercent}%</p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-between items-center">
              <span className="text-zinc-500 text-[10px] font-bold tracking-widest">
                ANIMAN.APP
              </span>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 sm:-right-16 sm:top-0 p-3 bg-zinc-800 rounded-full text-white hover:bg-zinc-700 transition-colors shadow-lg z-10"
          aria-label="닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  );
};
