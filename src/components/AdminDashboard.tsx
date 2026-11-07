// src/components/AdminDashboard.tsx
// 콘텐츠 편집: 이 기기에서 시리즈를 만들거나 고친 뒤 "시리즈 JSON 내보내기"로 받아
// src/data/series/<id>.json에 넣고 커밋한다. 저장하기 전에 "이 기기에 초안 저장"으로 앱에서 미리 볼 수 있다.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Image as ImageIcon, Database,
  CheckCircle2, AlertCircle, FileDown, Trash2,
} from 'lucide-react';
import type { AdminFormData, AdminJsonInput, SeriesRecord } from '../types';
import { deleteDraft, getSeries, saveDraft } from '../lib/catalog';
import { buildSeriesRecord, recordToAdminInput, seriesFileName } from '../lib/seriesBuilder';
import { downloadJson } from '../lib/download';
import { useCatalog } from '../hooks/useCatalog';

interface AdminDashboardProps {
  onBack: () => void;
}

const EMPTY_FORM: AdminFormData = {
  title: '',
  description: '',
  accentColor: '#03acb1',
  coverUrl: '',
  bannerUrl: '',
  youtubeBgmId: '',
};
const EMPTY_JSON = '{\n  "seasons": [],\n  "episodes": [],\n  "volumes": []\n}';

export const AdminDashboard = ({ onBack }: AdminDashboardProps) => {
  const catalog = useCatalog();
  const drafts = catalog.filter((s) => s.isDraft);
  /** 편집 중인 시리즈 (새 작품이면 null) */
  const [editing, setEditing] = useState<{ id: string; createdAt: string } | null>(null);
  const [formData, setFormData] = useState<AdminFormData>(EMPTY_FORM);
  const [jsonInput, setJsonInput] = useState(EMPTY_JSON);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadForEdit = (seriesId: string) => {
    if (!seriesId) {
      setEditing(null);
      setFormData(EMPTY_FORM);
      setJsonInput(EMPTY_JSON);
      return;
    }
    const record = getSeries(seriesId);
    if (!record) return;
    const { form, json } = recordToAdminInput(record);
    setEditing({ id: record.id, createdAt: record.created_at });
    setFormData(form);
    setJsonInput(JSON.stringify(json, null, 2));
  };

  /** 현재 입력으로 레코드를 만든다. 실패하면 토스트를 띄우고 null. */
  const buildRecord = (): SeriesRecord | null => {
    try {
      const parsed: AdminJsonInput = JSON.parse(jsonInput);
      const record = buildSeriesRecord(formData, parsed, {
        id: editing?.id,
        createdAt: editing?.createdAt,
        tmdb: editing ? getSeries(editing.id) : undefined,
      });
      // 같은 작업 중 다시 저장해도 같은 ID가 유지되도록 고정
      setEditing({ id: record.id, createdAt: record.created_at });
      setJsonInput(JSON.stringify(recordToAdminInput(record).json, null, 2));
      return record;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        showToast('JSON 형식이 잘못되었습니다. 콤마(,)나 따옴표(")를 확인해주세요.', 'error');
      } else {
        showToast(error instanceof Error ? error.message : '데이터 규격을 확인해주세요.', 'error');
      }
      return null;
    }
  };

  const handleSaveDraft = () => {
    const record = buildRecord();
    if (!record) return;
    saveDraft(record);
    showToast('이 기기에 초안으로 저장했습니다.', 'success');
  };

  const handleExport = () => {
    const record = buildRecord();
    if (!record) return;
    downloadJson(seriesFileName(record), record);
    showToast(`${seriesFileName(record)} → src/data/series/에 넣고 커밋하세요.`, 'success');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-zinc-950 text-gray-100 py-8 px-4 sm:px-6 lg:px-8 relative"
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl font-medium text-sm border ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
            style={{ backdropFilter: 'blur(8px)' }}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="뒤로 가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-gray-400">로컬에서 편집 → JSON 내보내기 → src/data/series/에 커밋</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSaveDraft}
              className="flex items-center gap-2 text-white px-4 py-2 rounded-lg font-medium transition-colors bg-indigo-600 hover:bg-indigo-700"
            >
              <Save className="w-4 h-4" />
              이 기기에 초안 저장
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 text-gray-100 px-4 py-2 rounded-lg font-medium transition-colors bg-zinc-800 hover:bg-zinc-700 border border-zinc-700"
            >
              <FileDown className="w-4 h-4" />
              시리즈 JSON 내보내기
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="edit-target" className="text-sm text-gray-400">편집 대상</label>
          <select
            id="edit-target"
            value={editing?.id ?? ''}
            onChange={(e) => loadForEdit(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">새 작품</option>
            {catalog.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}{s.isDraft ? ' (로컬)' : ''}
              </option>
            ))}
          </select>
          {editing && <span className="text-xs text-zinc-500 font-mono">id: {editing.id}</span>}
        </div>

        {drafts.length > 0 && (
          <div className="bg-zinc-900 border border-amber-500/30 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-semibold text-amber-300">이 기기의 초안 (아직 커밋 안 됨)</h2>
            <ul className="space-y-1">
              {drafts.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {d.title}
                    {d.overridesBundled && <span className="text-xs text-zinc-500 ml-2">번들 버전 수정</span>}
                  </span>
                  <span className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => downloadJson(seriesFileName(d), stripEntry(d))}
                      className="p-1.5 rounded hover:bg-zinc-800"
                      title="JSON 내보내기"
                      aria-label={`${d.title} JSON 내보내기`}
                    >
                      <FileDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`"${d.title}" 초안을 삭제할까요? (진행 기록은 지워지지 않습니다)`)) {
                          deleteDraft(d.id);
                          if (editing?.id === d.id) loadForEdit('');
                        }
                      }}
                      className="p-1.5 rounded hover:bg-zinc-800 text-rose-400"
                      title="초안 삭제"
                      aria-label={`${d.title} 초안 삭제`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 시리즈 정보 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b border-zinc-800 pb-3">
              <ImageIcon className="w-5 h-5 text-indigo-400" />
              Series Info &amp; Images
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="title">
                  Series Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="e.g., 장송의 프리렌"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="작품에 대한 간단한 설명을 입력하세요."
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Accent Color */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Accent Color
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    name="accentColor"
                    value={formData.accentColor}
                    onChange={handleInputChange}
                    className="h-10 w-14 rounded bg-zinc-950 border border-zinc-700 cursor-pointer"
                    aria-label="Accent color picker"
                  />
                  <input
                    type="text"
                    name="accentColor"
                    value={formData.accentColor}
                    onChange={handleInputChange}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                    aria-label="Accent color hex value"
                  />
                </div>
              </div>

              {/* YouTube BGM ID */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="youtubeBgmId">
                  YouTube BGM ID
                </label>
                <input
                  id="youtubeBgmId"
                  type="text"
                  name="youtubeBgmId"
                  value={formData.youtubeBgmId}
                  onChange={handleInputChange}
                  placeholder="e.g., jfKfPfyJRdk (유튜브 영상 고유 ID)"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Cover Image URL */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="coverUrl">
                  Cover Image URL
                </label>
                <input
                  id="coverUrl"
                  type="text"
                  name="coverUrl"
                  value={formData.coverUrl}
                  onChange={handleInputChange}
                  placeholder="https://..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 mb-2"
                />
                {formData.coverUrl ? (
                  <div className="h-32 w-24 bg-zinc-800 rounded-md overflow-hidden border border-zinc-700">
                    <img src={formData.coverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-32 w-24 bg-zinc-950 border border-dashed border-zinc-700 rounded-md flex items-center justify-center text-xs text-zinc-600">
                    No Image
                  </div>
                )}
              </div>

              {/* M-04: bannerUrl 입력 필드 추가 (기존에 누락됨) */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="bannerUrl">
                  Banner Image URL
                </label>
                <input
                  id="bannerUrl"
                  type="text"
                  name="bannerUrl"
                  value={formData.bannerUrl}
                  onChange={handleInputChange}
                  placeholder="https://..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 mb-2"
                />
                {formData.bannerUrl ? (
                  <div className="h-20 w-full bg-zinc-800 rounded-md overflow-hidden border border-zinc-700">
                    <img src={formData.bannerUrl} alt="Banner Preview" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-20 w-full bg-zinc-950 border border-dashed border-zinc-700 rounded-md flex items-center justify-center text-xs text-zinc-600">
                    No Banner
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* JSON 입력 */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col h-full">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
              <Database className="w-5 h-5 text-emerald-400" />
              Episodes &amp; Volumes (JSON Bulk Import)
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              복잡한 에피소드와 챕터 매핑은 JSON 포맷으로 한 번에 붙여넣어 관리하는 것이 빠릅니다.
            </p>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              className="flex-1 w-full bg-zinc-950 border border-zinc-700 rounded-lg p-4 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 resize-none"
              placeholder='{"seasons": [], "episodes": [], "volumes": []}'
              aria-label="JSON bulk import"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

/** 카탈로그 항목에서 화면용 플래그를 떼고 순수 레코드만 남긴다. */
const stripEntry = (entry: SeriesRecord & { isDraft?: boolean; overridesBundled?: boolean }): SeriesRecord => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isDraft, overridesBundled, ...record } = entry;
  return record;
};
