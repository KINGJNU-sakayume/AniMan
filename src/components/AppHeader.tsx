// src/components/AppHeader.tsx
// 모든 화면이 공유하는 상단 바. 예전에는 화면마다 헤더가 달랐고, 로그아웃 버튼이 fixed 로
// 떠 있어 "Add Series"·설정 버튼을 가려 클릭할 수 없었다.
import { ChevronLeft, CloudUpload, LogOut, Plus, Sparkles } from 'lucide-react';
import { withAlpha } from '../lib/color';

interface AppHeaderProps {
  accentColor: string;
  username?: string;
  syncing: boolean;
  /** 작품 화면에서만: 목록으로 돌아가기 */
  onBack?: () => void;
  onLogoClick: () => void;
  /** 관리자에게만 전달된다 */
  onAddSeries?: () => void;
  onLogout: () => void;
}

export const AppHeader = ({ accentColor, username, syncing, onBack, onLogoClick, onAddSeries, onLogout }: AppHeaderProps) => (
  <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
    <div className="max-w-7xl mx-auto h-14 sm:h-16 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1 min-w-0">
        {onBack && (
          <button
            onClick={onBack}
            className="-ml-1 p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="작품 목록으로"
            title="작품 목록으로"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <button onClick={onLogoClick} className="flex items-center gap-2 rounded-lg pr-1 hover:opacity-80 transition-opacity">
          <span
            className="p-1.5 sm:p-2 rounded-lg border transition-colors duration-500"
            style={{ backgroundColor: withAlpha(accentColor, 0.08), borderColor: withAlpha(accentColor, 0.2) }}
          >
            <Sparkles className="w-5 h-5 transition-colors duration-500" style={{ color: accentColor }} />
          </span>
          <span className="text-lg font-bold text-zinc-100">AniMan</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <span
          className={`flex items-center gap-1.5 text-xs text-zinc-400 transition-opacity duration-300 ${syncing ? 'opacity-100' : 'opacity-0'}`}
          role="status"
          aria-live="polite"
        >
          <CloudUpload className="w-4 h-4 animate-pulse" />
          <span className="hidden sm:inline">{syncing ? '저장 중…' : ''}</span>
        </span>

        {onAddSeries && (
          <button
            onClick={onAddSeries}
            className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3.5 text-sm font-semibold text-zinc-200 bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
            title="작품 추가 (관리자)"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">작품 추가</span>
          </button>
        )}

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors"
          title="로그아웃"
          aria-label={username ? `${username} 로그아웃` : '로그아웃'}
        >
          <span className="hidden sm:inline max-w-[10rem] truncate">{username}</span>
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>
);
