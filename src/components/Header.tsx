// src/components/Header.tsx
import { Sparkles, Settings } from 'lucide-react';

interface HeaderProps {
  accentColor: string;
  onLogoClick: () => void;
  onAdminClick: () => void;
}

export const Header = ({ accentColor, onLogoClick, onAdminClick }: HeaderProps) => {
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
          <button
            onClick={onAdminClick}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-zinc-800 transition-colors"
            title="Admin Dashboard"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
