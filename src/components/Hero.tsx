// src/components/Hero.tsx
import { motion } from 'framer-motion';
import { BookOpen, BookmarkPlus, ChevronRight, Loader2, Music, Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useYouTubeBgm } from '../hooks/useYouTubeBgm';
import { readableTextOn, withAlpha } from '../lib/color';
import { episodeLabel, formatDuration, volumeLabel, type ProgressSummary } from '../lib/progress';
import type { MediaKind, Series } from '../types';

/** 작품에 BGM 이 지정되지 않았을 때 쓰는 기본 곡 (기존 동작 유지) */
const DEFAULT_BGM_VIDEO_ID = 'DAjS4rGPMGo';

interface HeroProps {
  series: Series;
  progress: ProgressSummary;
  onOpenSocialCard: () => void;
  /** 다음에 볼/읽을 항목으로 타임라인을 스크롤 */
  onJumpToNext: (kind: MediaKind) => void;
}

const pillClass =
  'flex items-center justify-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/80 backdrop-blur-md text-zinc-200 font-bold transition-all hover:bg-zinc-700/80';

export const Hero = ({ series, progress, onOpenSocialCard, onJumpToNext }: HeroProps) => {
  const isDesktop = useIsDesktop();
  const bgm = useYouTubeBgm(series.youtubeBgmId ?? DEFAULT_BGM_VIDEO_ID);
  // 와이드 영역이므로 배너(가로 이미지)를 우선 사용
  const bannerImage = series.bannerUrl ?? series.coverUrl;
  const accent = series.accentColor;
  const { episodes, volumes } = progress;

  const nextLabel = (kind: MediaKind) => {
    const next = kind === 'episode' ? progress.nextEpisode : progress.nextVolume;
    if (!next) return '완료';
    return kind === 'episode' ? episodeLabel(next.number) : volumeLabel(next.number);
  };

  const bgmIcon =
    bgm.status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" />
      : bgm.isPlaying ? <Pause className="w-5 h-5" /> : <Music className="w-5 h-5" />;

  const bgmIndicator = bgm.isPlaying && (
    <span className="absolute -top-1 -right-1 flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: accent }} />
      <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: accent }} />
    </span>
  );

  // 화면 전환(리사이즈)과 무관하게 플레이어가 유지되도록 호스트는 항상 같은 위치에 둔다.
  const playerHost = <div ref={bgm.hostRef} className="bgm-host" aria-hidden="true" />;

  if (!isDesktop) {
    return (
      <section aria-label="작품 정보">
        {playerHost}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative w-full overflow-hidden"
          style={{ height: '72vw', minHeight: '280px', maxHeight: '400px' }}
        >
          {bannerImage ? (
            <img src={bannerImage} alt="" fetchPriority="high" className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${withAlpha(accent, 0.35)}, #18181b)` }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(to right, rgba(9,9,11,0.82) 0%, rgba(9,9,11,0.55) 45%, transparent 100%)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/15 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/50 to-transparent" />

          <div className="absolute top-0 left-0 right-0 p-4 pt-8">
            <h1
              className="text-3xl font-black tracking-tight leading-tight whitespace-pre-line line-clamp-3"
              style={{ color: accent, textShadow: `0 2px 20px ${withAlpha(accent, 0.55)}, 0 0 40px rgba(0,0,0,0.8)` }}
            >
              {series.title}
            </h1>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="grid grid-cols-2 gap-2.5">
              {([
                ['ANIME', episodes, 'eps', accent],
                ['MANGA', volumes, 'vols', '#ffffff'],
              ] as const).map(([label, stat, unit, color]) => (
                <div key={label} className="bg-zinc-950/75 backdrop-blur-sm rounded-2xl p-3.5 border border-white/10">
                  <p className="text-xs text-zinc-400 font-bold tracking-widest mb-1.5">{label}</p>
                  <p className="text-3xl font-black leading-none tabular-nums" style={{ color }}>
                    {Math.round(stat.percent)}%
                  </p>
                  <p className="text-sm text-zinc-300 mt-1.5 font-medium tabular-nums">
                    {stat.done} / {stat.total} {unit}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* 모바일 전용 액션 — 예전에는 공유·BGM·이어보기를 모바일에서 쓸 방법이 없었다. */}
        <div className="px-4 pt-3 grid grid-cols-[1fr_auto_auto] gap-2">
          <button
            onClick={() => onJumpToNext(progress.nextEpisode || !progress.nextVolume ? 'episode' : 'volume')}
            className="flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-bold border transition-colors active:scale-[0.98]"
            style={{ color: accent, borderColor: withAlpha(accent, 0.35), backgroundColor: withAlpha(accent, 0.1) }}
          >
            {progress.nextEpisode || progress.nextVolume ? (
              <>
                <Play className="w-4 h-4" />
                다음 {progress.nextEpisode ? nextLabel('episode') : nextLabel('volume')}
              </>
            ) : (
              '모두 완료 🎉'
            )}
          </button>
          <button onClick={onOpenSocialCard} className={`${pillClass} h-11 w-11`} aria-label="진도 공유 카드">
            <BookmarkPlus className="w-5 h-5" />
          </button>
          <button
            onClick={() => void bgm.toggle()}
            className={`${pillClass} relative h-11 w-11`}
            aria-label={bgm.isPlaying ? 'BGM 일시정지' : 'BGM 재생'}
            aria-pressed={bgm.isPlaying}
          >
            {bgmIcon}
            {bgmIndicator}
          </button>
        </div>
      </section>
    );
  }

  const rows: Array<{ kind: MediaKind; icon: ReactNode; stat: typeof episodes; label: string }> = [
    { kind: 'episode', icon: <Play className="w-5 h-5" style={{ color: accent }} />, stat: episodes, label: '애니메이션 진도' },
    { kind: 'volume', icon: <BookOpen className="w-5 h-5" style={{ color: accent }} />, stat: volumes, label: '만화 진도' },
  ];

  return (
    <section aria-label="작품 정보" className="relative overflow-hidden bg-zinc-950">
      {playerHost}
      <div className="absolute inset-0 z-0">
        {bannerImage && <img src={bannerImage} alt="" fetchPriority="high" className="w-full h-full object-cover opacity-70" />}
      </div>
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-transparent" />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

      <div className="relative z-20 max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
        <div className="w-full md:w-3/5 lg:w-1/2 md:pr-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="space-y-6">
            <h1
              className="text-4xl lg:text-5xl font-bold whitespace-pre-line leading-tight"
              style={{
                color: accent,
                textShadow: `0 2px 12px rgba(0,0,0,0.9), 0 4px 24px rgba(0,0,0,0.7), 0 0 30px ${withAlpha(accent, 0.25)}`,
              }}
            >
              {series.title}
            </h1>
            <p className="text-zinc-300 text-lg leading-relaxed max-w-xl text-shadow-strong">
              {series.description ??
                `${series.title.split('\n')[0]}의 애니메이션 에피소드와 원작 만화책 단행본의 타임라인을 한눈에 매핑하여 진도를 트래킹하세요.`}
            </p>
            <div className="space-y-3 text-sm font-medium text-zinc-200 text-shadow-strong">
              <p>
                지금까지 <strong style={{ color: accent }}>{series.title.split('\n')[0]}</strong>에{' '}
                <strong className="text-white">{formatDuration(progress.watchedMinutes)}</strong>을 쏟았습니다.
              </p>
              <p>
                만화책 진도의 <strong className="text-white">{Math.round(volumes.percent)}%</strong>를 따라잡았습니다!
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={onOpenSocialCard} className={`${pillClass} px-6 py-3 hover:scale-105`}>
                <BookmarkPlus className="w-5 h-5" />
                Share Progress
              </button>
              <button
                onClick={() => void bgm.toggle()}
                className={`${pillClass} relative px-6 py-3 hover:scale-105`}
                aria-pressed={bgm.isPlaying}
              >
                {bgmIcon}
                {bgm.isPlaying ? 'Pause BGM' : 'Play BGM'}
                {bgmIndicator}
              </button>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-16 pt-8 space-y-6 border-t border-zinc-800/50"
        >
          {rows.map(({ kind, icon, stat, label }) => {
            const complete = stat.total > 0 && stat.done === stat.total;
            return (
              <div key={kind} className="flex items-center gap-4 w-full">
                <div className="flex items-center justify-center flex-shrink-0">{icon}</div>
                <div className="flex-1 h-2 bg-zinc-800/80 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.percent}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: accent }}
                    role="progressbar"
                    aria-valuenow={Math.round(stat.percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={label}
                  />
                </div>
                <span className="text-zinc-300 font-mono text-sm w-14 text-right tabular-nums">
                  {stat.done}/{stat.total}
                </span>
                <button
                  onClick={() => onJumpToNext(kind)}
                  className="flex items-center gap-1 text-xs font-bold pl-4 pr-3 py-2 rounded-full transition-all border hover:scale-105 min-w-[7.5rem] justify-center"
                  style={{
                    color: complete ? readableTextOn(accent) : accent,
                    borderColor: complete ? accent : withAlpha(accent, 0.35),
                    backgroundColor: complete ? accent : withAlpha(accent, 0.08),
                  }}
                  title={complete ? '마지막 항목으로 이동' : '다음 항목으로 이동'}
                >
                  {complete ? 'Completed' : `다음 ${nextLabel(kind)}`}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};
