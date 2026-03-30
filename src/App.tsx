// src/App.tsx
import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Upload } from 'lucide-react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Timeline } from './components/Timeline';
import { SocialCard } from './components/SocialCard';
import { SeriesLanding } from './components/SeriesLanding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginModal } from './components/LoginModal';
import { useTimelineData } from './hooks/useTimelineData';
import { useAuth } from './hooks/useAuth';
import { useProgress } from './hooks/useProgress';

const AdminDashboard = lazy(() =>
  import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);

type AppView = 'landing' | 'series' | 'admin';

export default function App() {
  const [selectedAnime, setSelectedAnime] = useState<string>('');
  const [currentView, setCurrentView] = useState<AppView>('landing');
  const [showSocialCard, setShowSocialCard] = useState(false);

  // ── 인증 ──────────────────────────────────────────────────────────────────
  const {
    session, profile, loading: authLoading,
    pendingApproval, isApproved,
    login, register, logout, refreshProfile,
  } = useAuth();

  // ── 진도 (Supabase) ───────────────────────────────────────────────────────
  const { completedMap, toggle, bulkComplete, syncing } = useProgress(session);

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
    const targetIndex = list.findIndex((item) => item.id === id);
    if (targetIndex === -1) return;
    bulkComplete(selectedAnime, list.slice(0, targetIndex + 1).map((item) => item.id));
  };

  // ── 인증 로딩 ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // ── 미인증 or 승인 대기 → 로그인/가입 화면 ────────────────────────────────
  if (!isApproved) {
    return (
      <LoginModal
        onLogin={login}
        onRegister={register}
        onLogout={logout}
        onRefresh={refreshProfile}
        pendingApproval={pendingApproval}
      />
    );
  }

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
        {/* 동기화 상태 + 로그아웃 */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          {syncing && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border border-zinc-700
              rounded-full text-xs text-gray-400 backdrop-blur">
              <Upload className="w-3.5 h-3.5 animate-pulse" />
              저장 중…
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border border-zinc-700
              rounded-full text-xs text-gray-400 hover:text-gray-200 hover:bg-zinc-700
              transition-colors backdrop-blur"
            title="로그아웃"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{profile?.username ?? '로그아웃'}</span>
          </button>
        </div>

        <SeriesLanding
          completedMap={completedMap}
          onSelectSeries={handleSelectSeries}
          onAdminClick={() => setCurrentView('admin')}
        />
      </div>
    );
  }

  // ── 시리즈 뷰 ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-gray-100 selection:bg-indigo-500/30 font-sans">
      <Header
        accentColor={accentColor}
        onLogoClick={() => setCurrentView('landing')}
        onAdminClick={() => setCurrentView('admin')}
      />

      {/* 동기화 상태 + 로그아웃 */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
        {syncing && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border border-zinc-700
            rounded-full text-xs text-gray-400 backdrop-blur">
            <Upload className="w-3.5 h-3.5 animate-pulse" />
            저장 중…
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/90 border border-zinc-700
            rounded-full text-xs text-gray-400 hover:text-gray-200 hover:bg-zinc-700
            transition-colors backdrop-blur"
          title="로그아웃"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{profile?.username ?? '로그아웃'}</span>
        </button>
      </div>

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

      <footer className="bg-zinc-900 border-t border-zinc-800 py-8 text-center text-gray-500">
        <p>© {new Date().getFullYear()} AniMan Timeline Tracker. All rights reserved.</p>
      </footer>
    </div>
  );
}
