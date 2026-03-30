// src/components/Hero.tsx
import { motion } from 'framer-motion';
import { Play, BookOpen, BookmarkPlus, ChevronRight, Music, Pause } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Series } from '../types';

interface HeroDataSlice {
  episodes?: Array<{ id: string; duration?: number | null }>;
  volumes?: Array<{ id: string }>;
}

interface HeroProps {
  series: Series;
  data: HeroDataSlice;
  completedIds: string[];
  accentColor: string;
  onOpenSocialCard: () => void;
}

export const Hero = ({ series, data, completedIds, accentColor, onOpenSocialCard }: HeroProps) => {
  const bannerImage = series.cover_url ?? series.banner_url ?? series.banner_image_url;

  const totalEpisodes = data?.episodes?.length ?? 0;
  const completedEpisodes = data?.episodes?.filter((ep) => completedIds.includes(ep.id)).length ?? 0;
  const epPercent = totalEpisodes ? (completedEpisodes / totalEpisodes) * 100 : 0;

  const totalVolumes = data?.volumes?.length ?? 0;
  const completedVolumes = data?.volumes?.filter((vol) => completedIds.includes(vol.id)).length ?? 0;
  const volPercent = totalVolumes ? (completedVolumes / totalVolumes) * 100 : 0;

  const completedEpObjects = data?.episodes?.filter((ep) => completedIds.includes(ep.id)) ?? [];
  const totalMinutes = completedEpObjects.reduce((acc, ep) => acc + (Number(ep.duration) || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);
  const bgmVideoId = series.youtube_bgm_id ?? series.youtubeBgmId ?? 'DAjS4rGPMGo';

  const toggleBgm = () => {
    if (!youtubeIframeRef.current?.contentWindow) return;
    const command = isPlayingBgm ? 'pauseVideo' : 'playVideo';
    youtubeIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func: command, args: [] }),
      'https://www.youtube.com'
    );
    setIsPlayingBgm(!isPlayingBgm);
  };

  const scrollToNext = (type: 'episode' | 'volume') => {
    const list = type === 'episode' ? data.episodes : data.volumes;
    if (!list) return;
    const target = list.find((item) => !completedIds.includes(item.id)) ?? list[list.length - 1];
    if (target) {
      document.getElementById(`node-${target.id}`)?.scrollIntoView({
        behavior: 'smooth', inline: 'center', block: 'nearest',
      });
    }
  };

  const youtubeIframe = (
    <iframe
      ref={youtubeIframeRef}
      src={`https://www.youtube.com/embed/${bgmVideoId}?enablejsapi=1&autoplay=0&controls=0&loop=1&playlist=${bgmVideoId}&mute=0&origin=${
        typeof window !== 'undefined' ? window.location.origin : ''
      }`}
      allow="autoplay; encrypted-media"
      referrerPolicy="strict-origin-when-cross-origin"
      className="hidden"
      title="Background Music"
    />
  );

  // ── 모바일 전용 ────────────────────────────────────────────────────────────
  const mobileHero = (
    <div className="md:hidden">
      {youtubeIframe}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full overflow-hidden"
        style={{ height: '72vw', minHeight: '280px', maxHeight: '400px' }}
      >
        {/* 배경 이미지 */}
        {bannerImage ? (
          <img
            src={bannerImage}
            alt={series.title}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 bg-zinc-800" />
        )}

        {/* 좌측 페이드 — 제목 가시성 */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, rgba(9,9,11,0.82) 0%, rgba(9,9,11,0.55) 45%, transparent 100%)',
          }}
        />
        {/* 상단 페이드 */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/15 to-transparent" />
        {/* 하단 페이드 */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />

        {/* 상단: 한 줄 여백 후 제목 */}
        <div className="absolute top-0 left-0 right-0 p-4 pt-10">
          <h1
            className="text-3xl font-black tracking-tight leading-tight whitespace-pre-wrap"
            style={{ color: accentColor, textShadow: `0 2px 20px ${accentColor}90, 0 0 40px rgba(0,0,0,0.8)` }}
          >
            {series.title}
          </h1>
        </div>

        {/* 하단: 스탯 블록 */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-zinc-950/75 backdrop-blur-sm rounded-2xl p-3.5 border border-white/10">
              <p className="text-xs text-zinc-400 font-bold tracking-widest uppercase mb-1.5">ANIME</p>
              <p className="text-3xl font-black leading-none" style={{ color: accentColor }}>
                {Math.round(epPercent)}%
              </p>
              <p className="text-sm text-zinc-300 mt-1.5 font-medium">
                {completedEpisodes} / {totalEpisodes} eps
              </p>
            </div>
            <div className="bg-zinc-950/75 backdrop-blur-sm rounded-2xl p-3.5 border border-white/10">
              <p className="text-xs text-zinc-400 font-bold tracking-widest uppercase mb-1.5">MANGA</p>
              <p className="text-3xl font-black leading-none text-white">
                {Math.round(volPercent)}%
              </p>
              <p className="text-sm text-zinc-300 mt-1.5 font-medium">
                {completedVolumes} / {totalVolumes} vols
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  // ── PC 전용: 기존 완전 유지 ────────────────────────────────────────────────
  // Change 3: pre-compute next incomplete indices for dynamic button labels
  const nextEpIndex = data.episodes?.findIndex(ep => !completedIds.includes(ep.id)) ?? -1;
  const nextVolIndex = data.volumes?.findIndex(vol => !completedIds.includes(vol.id)) ?? -1;

  const desktopHero = (
    <div className="hidden md:block relative overflow-hidden bg-zinc-950">
      {youtubeIframe}
      <div className="absolute inset-0 z-0">
        {bannerImage && (
          <img src={bannerImage} alt={series.title} className="w-full h-full object-cover opacity-70" />
        )}
      </div>
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="w-full md:w-1/2 md:pr-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            {/* Change 1: dark contrast shadow + accent glow on h1 */}
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold whitespace-pre-wrap leading-tight"
              style={{
                color: accentColor,
                textShadow: `0 2px 12px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.7), 0 0 30px ${accentColor}40`,
              }}
            >
              {series.title}
            </motion.h1>
            {/* Change 1: dark shadow on description paragraph */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-gray-300 text-lg leading-relaxed max-w-xl"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.9)' }}
            >
              {series.description ??
                `${series.title}의 애니메이션 에피소드와 원작 만화책 단행본의 타임라인을 한눈에 매핑하여 진도를 트래킹하세요.`}
            </motion.p>
            {/* Change 1: dark shadow on stat lines */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.25 }}
              className="space-y-3 text-sm font-medium text-gray-200 drop-shadow-lg"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.9)' }}
            >
              <p>
                지금까지 <strong style={{ color: accentColor }}>{series.title}</strong>에{' '}
                <strong className="text-white">{hours}시간 {minutes}분</strong>을 쏟았습니다.
              </p>
              <p>
                만화책 진도의 <strong className="text-white">{Math.round(volPercent)}%</strong>를 따라잡았습니다!
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <button
                onClick={onOpenSocialCard}
                className="flex items-center gap-2 px-6 py-3 text-gray-200 bg-zinc-800/80 hover:bg-zinc-700/80 backdrop-blur-md border border-zinc-700 rounded-full font-bold transition-all hover:scale-105"
              >
                <BookmarkPlus className="w-5 h-5" />
                Share Progress
              </button>
              <button
                onClick={toggleBgm}
                className="flex items-center gap-2 px-6 py-3 text-gray-200 bg-zinc-800/80 hover:bg-zinc-700/80 backdrop-blur-md border border-zinc-700 rounded-full font-bold transition-all hover:scale-105 relative"
              >
                {isPlayingBgm ? <Pause className="w-5 h-5" /> : <Music className="w-5 h-5" />}
                {isPlayingBgm ? 'Pause BGM' : 'Play BGM'}
                {isPlayingBgm && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accentColor }} />
                    <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: accentColor }} />
                  </span>
                )}
              </button>
            </motion.div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 pt-8 space-y-6 border-t border-zinc-800/50"
        >
          {[
            {
              // Change 2: larger icon, accent color, no circle wrapper
              icon: <Play className="w-5 h-5" style={{ color: accentColor }} />,
              percent: epPercent,
              completed: completedEpisodes,
              total: totalEpisodes,
              type: 'episode' as const,
              label: '애니메이션 진도',
              // Change 3: dynamic next label
              resumeLabel: epPercent === 100 ? 'Completed' : nextEpIndex >= 0 ? `Ep ${nextEpIndex + 1} ↓` : 'Completed',
            },
            {
              // Change 2: larger icon, accent color, no circle wrapper
              icon: <BookOpen className="w-5 h-5" style={{ color: accentColor }} />,
              percent: volPercent,
              completed: completedVolumes,
              total: totalVolumes,
              type: 'volume' as const,
              label: '만화 진도',
              // Change 3: dynamic next label
              resumeLabel: volPercent === 100 ? 'Completed' : nextVolIndex >= 0 ? `Vol ${nextVolIndex + 1} ↓` : 'Completed',
            },
          ].map(({ icon, percent, completed, total, type, label, resumeLabel }) => (
            <div key={type} className="flex items-center gap-4 w-full">
              {/* Change 2: removed bg-zinc-800 border border-zinc-700 circle wrapper */}
              <div className="flex items-center justify-center flex-shrink-0">
                {icon}
              </div>
              <div className="flex-1 h-2 bg-zinc-800/80 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: accentColor }}
                  role="progressbar"
                  aria-valuenow={Math.round(percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                />
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-gray-300 font-mono text-sm w-12 text-right">{completed}/{total}</span>
                <button
                  onClick={() => scrollToNext(type)}
                  className="flex items-center gap-1 text-xs font-bold px-4 py-2 rounded-full transition-all border hover:scale-105"
                  style={{
                    color: percent === 100 ? '#fff' : accentColor,
                    borderColor: percent === 100 ? accentColor : `${accentColor}50`,
                    backgroundColor: percent === 100 ? accentColor : `${accentColor}10`,
                  }}
                >
                  {/* Change 3: dynamic label */}
                  {resumeLabel} <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );

  return (
    <>
      {mobileHero}
      {desktopHero}
    </>
  );
};
