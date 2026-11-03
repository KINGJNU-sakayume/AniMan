// src/components/BackupMenu.tsx
// 진행 기록 JSON 백업 내보내기 / 불러오기(미리보기 → 승인).
import { useEffect, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import {
  applyBackup,
  backupFileName,
  exportBackup,
  parseBackup,
  previewBackup,
  type ImportMode,
  type ProgressBackup,
} from '../lib/progress';
import { downloadJson } from '../lib/download';
import { subscribeImportReview } from '../lib/progress/importReview';

const btn =
  'flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors';

export const BackupMenu = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: ProgressBackup; fileName: string; note?: string } | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const flash = (text: string, error = false) => {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleExport = () => {
    downloadJson(backupFileName(), exportBackup());
    flash('백업 파일을 내려받았습니다. (공개 저장소에 커밋하지 마세요)');
  };

  // 동기화 설정이 요청한 검토(예: 180일 넘게 동기화하지 않은 기기의 서버 문서)를 같은 미리보기로 연다.
  useEffect(
    () =>
      subscribeImportReview((request) => {
        setMode(request.mode ?? 'merge');
        setPending({ backup: request.backup, fileName: request.fileName, note: request.note });
      }),
    []
  );

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) {
      flash(`불러오기 실패: ${result.error}`, true);
      return;
    }
    setMode('merge');
    setPending({ backup: result.backup, fileName: file.name });
  };

  const preview = pending ? previewBackup(pending.backup, mode) : null;

  const handleApply = () => {
    if (!pending) return;
    applyBackup(pending.backup, mode);
    setPending(null);
    flash('진행 기록을 불러왔습니다.');
  };

  return (
    <>
      <button type="button" onClick={handleExport} className={btn} title="진행 기록 백업 내보내기">
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">백업 내보내기</span>
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} className={btn} title="진행 기록 백업 불러오기">
        <Upload className="w-4 h-4" />
        <span className="hidden sm:inline">불러오기</span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="backup-file-input"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {message && (
        <div
          role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg text-sm border ${
            message.error
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {pending && preview && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-preview-title"
            className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4 text-gray-100"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="backup-preview-title" className="text-lg font-bold">백업 불러오기 미리보기</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  {pending.fileName}
                  {pending.backup.exportedAt && ` · ${new Date(pending.backup.exportedAt).toLocaleString()}`}
                </p>
              </div>
              <button type="button" onClick={() => setPending(null)} aria-label="닫기" className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {pending.note && <p className="text-xs text-amber-300" data-testid="backup-note">{pending.note}</p>}
            {pending.backup.version === 1 && (
              <p className="text-xs text-zinc-400">
                구형(v1) 백업 파일이에요. 모든 항목이 파일을 내보낸 시각에 완료로 들어와요.
              </p>
            )}

            <fieldset className="flex gap-4 text-sm">
              <legend className="sr-only">불러오기 방식</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
                합치기 (항목별로 더 나중에 바꾼 쪽이 적용)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
                덮어쓰기
              </label>
            </fieldset>

            <div className="max-h-64 overflow-auto border border-zinc-800 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800/60 text-zinc-400 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2">작품</th>
                    <th className="text-right px-3 py-2">현재</th>
                    <th className="text-right px-3 py-2">적용 후</th>
                    <th className="text-right px-3 py-2">변화</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">변경 사항이 없습니다.</td>
                    </tr>
                  )}
                  {preview.rows.map((row) => (
                    <tr key={row.seriesId} className="border-t border-zinc-800">
                      <td className="px-3 py-2">
                        {row.title ?? <span className="text-amber-400">알 수 없는 작품 ({row.seriesId.slice(0, 8)}…)</span>}
                        {row.title && row.unknownIds > 0 && (
                          <span className="block text-xs text-amber-400">카탈로그에 없는 항목 {row.unknownIds}개</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{row.before}</td>
                      <td className="px-3 py-2 text-right">{row.after}</td>
                      <td className="px-3 py-2 text-right">
                        {row.added > 0 && <span className="text-emerald-400">+{row.added}</span>}
                        {row.removed > 0 && <span className="text-rose-400 ml-1">−{row.removed}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-sm text-zinc-300" data-testid="backup-preview-summary">
              추가 {preview.totalAdded}개 · 제거 {preview.totalRemoved}개
            </p>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className={btn}>취소</button>
              <button
                type="button"
                onClick={handleApply}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
