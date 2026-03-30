// src/components/SearchBar.tsx
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  accentColor: string;
}

export const SearchBar = ({ value, onChange, accentColor }: SearchBarProps) => {
  return (
    <div className="relative flex-1 max-w-md">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="작품명 검색 (e.g. 슬램덩크)" // 💡 기획 의도에 맞게 문구 변경
        className="w-full pl-10 pr-10 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-zinc-600 transition-colors"
        style={{
          '--focus-color': accentColor,
        } as React.CSSProperties}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          title="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};