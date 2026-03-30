// src/components/Header.tsx
import { Sparkles, Settings } from 'lucide-react';
import { SearchBar } from './SearchBar';

export interface SeriesOption {
  id: string;
  title: string;
}

interface HeaderProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  accentColor: string;
  selectedAnime: string;
  onAnimeChange: (value: string) => void;
  onAdminClick: () => void;
  seriesList: SeriesOption[];
}

export const Header = ({
  searchValue,
  onSearchChange,
  accentColor,
  selectedAnime,
  onAnimeChange,
  onAdminClick,
  seriesList = [],
}: HeaderProps) => {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-2">
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
          </div>

          <select
            value={selectedAnime}
            onChange={(e) => onAnimeChange(e.target.value)}
            className="bg-zinc-800/80 border text-gray-100 text-sm rounded-lg focus:outline-none px-3 py-2 cursor-pointer transition-colors duration-300 max-w-[200px] truncate"
            style={{ borderColor: `${accentColor}50` }}
          >
            {seriesList.length > 0 ? (
              seriesList.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title}
                </option>
              ))
            ) : (
              <option value="" disabled>작품을 불러오는 중...</option>
            )}
          </select>
        </div>

        {/* 검색창: 작품이 많아지면 활용 — 현재는 모바일에서 숨김 */}
        <div className="hidden sm:flex flex-1">
          <SearchBar value={searchValue} onChange={onSearchChange} accentColor={accentColor} />
        </div>

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