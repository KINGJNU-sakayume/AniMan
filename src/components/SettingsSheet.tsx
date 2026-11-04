// src/components/SettingsSheet.tsx
// 헤더 톱니가 여는 「설정」 시트: Life Hub → 백업 → 카탈로그 관리.
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { LifeHubSettings } from './LifeHubSettings';
import { BackupSection } from './BackupMenu';

const small = 'px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-40';

export function SettingsSheet({ onClose, onCatalog }: { onClose: () => void; onCatalog: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4 text-gray-100"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="settings-title" className="text-lg font-bold">설정</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <LifeHubSettings onClose={onClose} />
        <BackupSection onClose={onClose} />

        <div className="border-t border-zinc-800 pt-4">
          <button
            type="button"
            className={`${small} border-zinc-700 text-zinc-300 hover:bg-zinc-800`}
            onClick={() => {
              onClose();
              onCatalog();
            }}
          >
            카탈로그 관리
          </button>
        </div>
      </div>
    </div>
  );
}
