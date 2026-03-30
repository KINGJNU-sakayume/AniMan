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
        {/* 인스타그램 스토리 9:16 비율 */}
        <div className="w-[320px] h-[568px] sm:w-[360px] sm:h-[640px] bg-zinc-900 rounded-[2rem] overflow-hidden border border-zinc-800 shadow-2xl relative">
          {bannerImage && (
            <img
              src={bannerImage}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover opacity-30 grayscale"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-8 space-y-6">
            <div className="space-y-2">
              <p className="text-zinc-400 text-[10px] font-black tracking-[0.3em] uppercase">
                AniMan Journey
              </p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tighter leading-tight text-white drop-shadow-md">
                {series.title}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <p className="text-[10px] text-zinc-400 font-bold mb-1">ANIME WATCHED</p>
                <p className="text-2xl font-black" style={{ color: accentColor }}>
                  {epPercent}%
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                <p className="text-[10px] text-zinc-400 font-bold mb-1">MANGA SYNC</p>
                <p className="text-2xl font-black text-white">{volPercent}%</p>
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
