// src/components/Header.tsx
import { Sparkles, Settings } from 'lucide-react';

interface HeaderProps {
  accentColor: string;
  onLogoClick: () => void;
  onSettingsClick: () => void;
  /** Life Hub 「확인 필요」(상태 C): 톱니에 경고색 점 */
  needsAttention?: boolean;
}

/** 헤더 톱니: 「설정」 시트를 연다. 확인이 필요하면 오른쪽 위 8px 경고색 점과 접근성 이름 끝 ` (확인 필요)`. */
export const SettingsButton = ({ onClick, needsAttention = false }: { onClick: () => void; needsAttention?: boolean }) => {
  const name = needsAttention ? '설정 (확인 필요)' : '설정';
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-zinc-800 transition-colors"
      title={name}
      aria-label={name}
    >
      <Settings className="w-5 h-5" />
      {needsAttention && (
        <span
          aria-hidden="true"
          data-testid="settings-attention"
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"
        />
      )}
    </button>
  );
};

export const Header = ({ accentColor, onLogoClick, onSettingsClick, needsAttention }: HeaderProps) => {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-6">
        {/* Logo — click to return to landing page */}
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <div
            className="p-2 rounded-lg transition-colors duration-500"
            style={{
              backgroundColor: `${accentColor}15`,
              borderColor: `${accentColor}30`,
              borderWidth: '1px',
            }}
          >
            <Sparkles className="w-5 h-5 transition-colors duration-500" style={{ color: accentColor }} />
          </div>
          <h1 className="text-lg font-bold text-gray-100 hidden sm:block">AniMan</h1>
        </button>

        <div className="flex items-center flex-shrink-0">
          <SettingsButton onClick={onSettingsClick} needsAttention={needsAttention} />
        </div>
      </div>
    </header>
  );
};
