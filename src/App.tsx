// src/App.tsx
import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Timeline } from './components/Timeline';
import { SocialCard } from './components/SocialCard';
import { SeriesLanding } from './components/SeriesLanding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackupDialogs } from './components/BackupMenu';
import { LifeHubMenu } from './components/LifeHubMenu';
import { SettingsSheet } from './components/SettingsSheet';
import { useLifeHubBoot, useLifeHubView } from './hooks/useLifeHub';
import { useTimelineData } from './hooks/useTimelineData';
import { useProgress } from './hooks/useProgress';
import { markUpTo } from './lib/progress';

const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

type AppView = 'landing' | 'series' | 'admin';

export default function App() {
  const [selectedAnime, setSelectedAnime] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [showSocialCard, setShowSocialCard] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── 진도 (이 기기 localStorage) ───────────────────────────────────────────
  const { completedMap, toggle } = useProgress();

  // ── Life Hub: 기기 동기화(시작·탭 복귀 시 가져오고, 변경 후 몇 초 뒤·탭이 숨겨질 때 올림)와 제안 가져오기.
  //    화면과 무관하게 여기서 돈다. 연결 콜백이 끝나면 설정 시트를 연다. ──
  useLifeHubBoot(() => setSettingsOpen(true));
  const needsAttention = useLifeHubView().state === 'C';
  const overlays = (
    <>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onCatalog={() => setCurrentView('admin')} />}
      <BackupDialogs />
    </>
  );

  // ── 타임라인 데이터 ───────────────────────────────────────────────────────
  const { data: fetchedData, loading: isLoading, error: isError } =
    useTimelineData(selectedAnime);

  const accentColor =
    fetchedData?.series?.accent_color ??
    fetchedData?.series?.accentColor ??
    '#03acb1';

  const currentCompletedIds = completedMap[selectedAnime] ?? [];

  const handleSelectSeries = (seriesId: string) => {
    setSelectedAnime(seriesId);
    setCurrentView('series');
  };

  const handleToggleComplete = (id: string) => {
    if (!selectedAnime) return;
    toggle(selectedAnime, id);
  };

  const handleRightClickComplete = (type: 'episode' | 'volume', id: string) => {
    if (!selectedAnime || !fetchedData) return;
    const list = type === 'episode' ? fetchedData.episodes : fetchedData.volumes;
    if (!list) return;
    const target = list.find((item) => item.id === id);
    if (!target) return;
    markUpTo(selectedAnime, type, target.number);
  };

  // ── 어드민 뷰 ─────────────────────────────────────────────────────────────
  if (currentView === 'admin') {
    return (
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          }
        >
          <AdminDashboard onBack={() => setCurrentView('landing')} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // ── 랜딩 뷰 ───────────────────────────────────────────────────────────────
  if (currentView === 'landing') {
    return (
      <div className="min-h-screen bg-zinc-950 text-gray-100 selection:bg-indigo-500/30 font-sans">
        <SeriesLanding
          completedMap={completedMap}
          onSelectSeries={handleSelectSeries}
          onAdminClick={() => setCurrentView('admin')}
          onSettingsClick={() => setSettingsOpen(true)}
          needsAttention={needsAttention}
          actions={<LifeHubMenu />}
        />
        {overlays}
      </div>
    );
  }

  // ── 시리즈 뷰 ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-gray-100 selection:bg-indigo-500/30 font-sans">
      <Header
        accentColor={accentColor}
        onLogoClick={() => setCurrentView('landing')}
        onSettingsClick={() => setSettingsOpen(true)}
        needsAttention={needsAttention}
      />

      {/* 로딩 */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div
            className="w-10 h-10 border-4 border-zinc-800 rounded-full animate-spin"
            style={{ borderTopColor: accentColor }}
            role="status"
          />
        </div>
      )}

      {/* 에러 */}
      {isError && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold text-red-400">오류 발생</h2>
            <p className="text-gray-400">{isError}</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {fetchedData && !isLoading && !isError && (
          <motion.div
            key={selectedAnime}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
          >
            <ErrorBoundary>
              <Hero
                series={fetchedData.series}
                data={fetchedData}
                completedIds={currentCompletedIds}
                accentColor={accentColor}
                onOpenSocialCard={() => setShowSocialCard(true)}
              />
              <Timeline
                data={fetchedData}
                completedIds={currentCompletedIds}
                onToggleComplete={handleToggleComplete}
                onRightClickComplete={handleRightClickComplete}
                accentColor={accentColor}
              />
            </ErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSocialCard && fetchedData && (
          <SocialCard
            series={fetchedData.series}
            data={fetchedData}
            completedIds={currentCompletedIds}
            accentColor={accentColor}
            onClose={() => setShowSocialCard(false)}
          />
        )}
      </AnimatePresence>

      {overlays}

      <footer className="bg-zinc-900 border-t border-zinc-800 py-8 text-center text-gray-500">
        <p>© {new Date().getFullYear()} AniMan Timeline Tracker. All rights reserved.</p>
      </footer>
    </div>
  );
}
