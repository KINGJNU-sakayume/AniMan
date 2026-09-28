// src/App.tsx
// 인증 게이트 → 공용 헤더 → 해시 라우트(목록 / 작품 / 관리자).
import { lazy, Suspense, useCallback, useState, type CSSProperties } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { AppHeader } from './components/AppHeader';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginModal } from './components/LoginModal';
import { FullScreenSpinner } from './components/Spinner';
import { useAuth } from './hooks/useAuth';
import { routeHref, useHashRoute, useRouteScroll } from './hooks/useHashRoute';
import { useProgress } from './hooks/useProgress';
import { DEFAULT_ACCENT } from './lib/color';
import { isSupabaseConfigured } from './lib/supabase';
import { LandingPage } from './pages/LandingPage';
import { SeriesPage } from './pages/SeriesPage';

const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));

const previewLabel = import.meta.env.VITE_PREVIEW_LABEL as string | undefined;

const toaster = (
  <Toaster
    position="bottom-center"
    toastOptions={{
      style: { background: '#18181b', color: '#e4e4e7', border: '1px solid #3f3f46', fontSize: '14px', maxWidth: '92vw' },
      success: { iconTheme: { primary: DEFAULT_ACCENT, secondary: '#09090b' } },
    }}
  />
);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      {isSupabaseConfigured ? <AuthedApp /> : <ConfigMissing />}
      {toaster}
      {previewLabel && (
        <div className="fixed bottom-2 left-2 z-[300] pointer-events-none rounded-md bg-amber-400/90 px-2 py-0.5 text-[11px] font-bold text-zinc-950 shadow">
          PREVIEW · {previewLabel}
        </div>
      )}
    </MotionConfig>
  );
}

const ConfigMissing = () => (
  <div className="min-h-dvh flex items-center justify-center p-6 text-center">
    <div className="max-w-sm space-y-3">
      <h1 className="text-xl font-bold text-zinc-100">설정이 필요합니다</h1>
      <p className="text-sm text-zinc-400">
        VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 없습니다. <code>.env</code> 또는 배포 시크릿을 확인해주세요.
      </p>
    </div>
  </div>
);

function AuthedApp() {
  const auth = useAuth();
  const { completedMap, toggle, completeMany, replace, syncing } = useProgress(auth.isApproved ? auth.user?.id ?? null : null);
  const { route, hash, navigate } = useHashRoute();
  const [seriesAccent, setSeriesAccent] = useState<string | null>(null);
  useRouteScroll(hash);

  const goHome = useCallback(() => navigate(routeHref.landing), [navigate]);
  const openSeries = useCallback((id: string) => navigate(routeHref.series(id)), [navigate]);
  const openAdmin = useCallback(() => navigate(routeHref.admin), [navigate]);

  if (auth.loading) return <FullScreenSpinner />;

  if (!auth.isApproved) {
    return (
      <LoginModal
        onLogin={auth.login}
        onRegister={auth.register}
        onLogout={auth.logout}
        onRefresh={auth.refreshProfile}
        pendingApproval={auth.pendingApproval}
        profileError={auth.profileError}
        username={auth.profile?.username}
      />
    );
  }

  if (route.name === 'admin') {
    return (
      <ErrorBoundary>
        <Suspense fallback={<FullScreenSpinner />}>
          <AdminDashboard onBack={goHome} onOpenSeries={openSeries} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const accent = route.name === 'series' ? seriesAccent ?? DEFAULT_ACCENT : DEFAULT_ACCENT;

  return (
    <div className="min-h-dvh flex flex-col" style={{ '--accent': accent } as CSSProperties}>
      <AppHeader
        accentColor={accent}
        username={auth.profile?.username}
        syncing={syncing}
        onBack={route.name === 'series' ? goHome : undefined}
        onLogoClick={goHome}
        onAddSeries={auth.isAdmin ? openAdmin : undefined}
        onLogout={auth.logout}
      />
      <div className="flex-1">
        {route.name === 'series' ? (
          <SeriesPage
            key={route.seriesId}
            seriesId={route.seriesId}
            completedIds={completedMap[route.seriesId] ?? []}
            onToggle={toggle}
            onCompleteMany={completeMany}
            onReplace={replace}
            onBack={goHome}
            onAccentChange={setSeriesAccent}
          />
        ) : (
          <LandingPage completedMap={completedMap} onSelectSeries={openSeries} onAddSeries={auth.isAdmin ? openAdmin : undefined} />
        )}
      </div>
      <footer className="border-t border-zinc-800/80 py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} AniMan Timeline Tracker
      </footer>
    </div>
  );
}
