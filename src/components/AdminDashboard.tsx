// src/components/AdminDashboard.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Save, Image as ImageIcon, Database,
  Loader2, CheckCircle2, AlertCircle, Lock,
} from 'lucide-react';
import { saveAdminData } from '../lib/supabase';
import type { AdminFormData, AdminJsonInput } from '../types';

interface AdminDashboardProps {
  onBack: () => void;
}

// C-03: 어드민 인증 — VITE_ADMIN_PASSWORD 환경변수와 대조
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? '';

export const AdminDashboard = ({ onBack }: AdminDashboardProps) => {
  // C-03: 인증 상태
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);

  const [formData, setFormData] = useState<AdminFormData>({
    title: '',
    description: '',
    accentColor: '#03acb1',
    coverUrl: '',
    bannerUrl: '',
    youtubeBgmId: '',
  });

  const [jsonInput, setJsonInput] = useState(
    '{\n  "seasons": [],\n  "episodes": [],\n  "volumes": []\n}'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // C-03: 패스워드 검증
  const handleLogin = () => {
    if (!ADMIN_PASSWORD || pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

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

  const handleSave = async () => {
    if (!formData.title.trim()) {
      showToast('작품 제목(Series Title)은 필수입니다.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      const parsedJson: AdminJsonInput = JSON.parse(jsonInput);
      await saveAdminData(
        formData,
        parsedJson.episodes ?? [],
        parsedJson.volumes ?? [],
        parsedJson.seasons ?? []
      );
      showToast('성공적으로 DB에 저장되었습니다! 🎉', 'success');
      setFormData({
        title: '',
        description: '',
        accentColor: '#03acb1',
        coverUrl: '',
        bannerUrl: '',
        youtubeBgmId: '',
      });
      setJsonInput('{\n  "seasons": [],\n  "episodes": [],\n  "volumes": []\n}');
    } catch (error: unknown) {
      console.error('Save failed:', error);
      if (error instanceof SyntaxError) {
        showToast('JSON 형식이 잘못되었습니다. 콤마(,)나 따옴표(")를 확인해주세요.', 'error');
      } else if (error instanceof Error) {
        showToast(`저장 실패: ${error.message}`, 'error');
      } else {
        showToast('저장 실패: 데이터 규격을 확인해주세요.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // C-03: 인증 전 — 패스워드 입력 화면
  if (!authed) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-zinc-950 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-zinc-800 rounded-full">
              <Lock className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-100">Admin 인증</h2>
            <p className="text-sm text-gray-400 text-center">
              관리자 패스워드를 입력하세요
            </p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Password"
              className={`w-full bg-zinc-950 border rounded-lg px-4 py-2 text-sm text-gray-100 focus:outline-none ${
                pwError ? 'border-red-500' : 'border-zinc-700 focus:border-indigo-500'
              }`}
              aria-label="Admin password"
            />
            {pwError && (
              <p className="text-xs text-red-400">패스워드가 올바르지 않습니다.</p>
            )}
            <button
              onClick={handleLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium text-sm transition-colors"
            >
              로그인
            </button>
            <button
              onClick={onBack}
              className="w-full text-gray-500 hover:text-gray-300 py-1 text-sm transition-colors"
            >
              돌아가기
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // 인증 후 — 어드민 대시보드
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
              <p className="text-sm text-gray-400">작품 정보 및 에피소드 데이터 매핑 관리</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 text-white px-4 py-2 rounded-lg font-medium transition-colors ${
              isSaving ? 'bg-indigo-600/50 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

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
