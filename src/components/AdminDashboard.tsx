// src/components/AdminDashboard.tsx
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, AlertCircle, Database, Image as ImageIcon, Loader2, Lock, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { saveAdminData } from '../lib/api';
import { DEFAULT_ACCENT, normalizeHex } from '../lib/color';
import type { AdminFormData, AdminJsonInput } from '../types';

interface AdminDashboardProps {
  onBack: () => void;
  onOpenSeries: (seriesId: string) => void;
}

// UX 용 게이트일 뿐이며(번들에 포함됨) 실제 쓰기 권한은 DB RLS(is_admin)가 강제한다.
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD ?? '';

const EMPTY_FORM: AdminFormData = {
  title: '', description: '', accentColor: DEFAULT_ACCENT, coverUrl: '', bannerUrl: '', youtubeBgmId: '',
};
const EMPTY_JSON = '{\n  "seasons": [],\n  "episodes": [],\n  "volumes": []\n}';

const inputClass =
  'w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2 text-base sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#03acb1] transition-colors';
const labelClass = 'block text-sm font-medium text-zinc-400 mb-1';

type JsonCheck = { ok: true; value: AdminJsonInput; summary: string } | { ok: false; message: string };

function checkJson(text: string): JsonCheck {
  try {
    const value = JSON.parse(text) as AdminJsonInput;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, message: '최상위는 { "seasons", "episodes", "volumes" } 객체여야 합니다.' };
    }
    for (const key of ['seasons', 'episodes', 'volumes'] as const) {
      if (value[key] !== undefined && !Array.isArray(value[key])) return { ok: false, message: `"${key}" 는 배열이어야 합니다.` };
    }
    const summary = `시즌 ${value.seasons?.length ?? 0} · 에피소드 ${value.episodes?.length ?? 0} · 단행본 ${value.volumes?.length ?? 0}`;
    return { ok: true, value, summary };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'JSON 형식 오류' };
  }
}

export const AdminDashboard = ({ onBack, onOpenSeries }: AdminDashboardProps) => {
  const [authed, setAuthed] = useState(!ADMIN_PASSWORD);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  const [formData, setFormData] = useState<AdminFormData>(EMPTY_FORM);
  const [jsonInput, setJsonInput] = useState(EMPTY_JSON);
  const [isSaving, setIsSaving] = useState(false);

  const json = useMemo(() => checkJson(jsonInput), [jsonInput]);
  const accentValid = normalizeHex(formData.accentColor, '') !== '';

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error('작품 제목(Series Title)은 필수입니다.');
      return;
    }
    if (!accentValid) {
      toast.error('Accent Color 는 #03acb1 같은 HEX 값이어야 합니다.');
      return;
    }
    if (!json.ok) {
      toast.error('JSON 형식이 잘못되었습니다. 콤마(,)나 따옴표(")를 확인해주세요.');
      return;
    }
    setIsSaving(true);
    try {
      const seriesId = await saveAdminData(formData, json.value.episodes ?? [], json.value.volumes ?? [], json.value.seasons ?? []);
      const title = formData.title.trim();
      setFormData(EMPTY_FORM);
      setJsonInput(EMPTY_JSON);
      toast.success(
        (t) => (
          <span className="flex items-center gap-3">
            <span>'{title}' 저장 완료</span>
            <button className="font-semibold underline underline-offset-2 text-[#03acb1]" onClick={() => { toast.dismiss(t.id); onOpenSeries(seriesId); }}>
              작품 보기
            </button>
          </span>
        ),
        { duration: 6000 },
      );
    } catch (error: unknown) {
      console.error('Save failed:', error);
      toast.error(`저장 실패: ${error instanceof Error ? error.message : '데이터 규격을 확인해주세요.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!authed) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-dvh bg-zinc-950 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-zinc-800 rounded-full">
              <Lock className="w-6 h-6 text-[#03acb1]" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Admin 인증</h2>
            <p className="text-sm text-zinc-400 text-center">관리자 패스워드를 입력하세요</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className={`${inputClass} ${pwError ? '!border-red-500' : ''}`}
              aria-label="Admin password"
              aria-invalid={pwError}
            />
            {pwError && <p role="alert" className="text-sm text-red-400">패스워드가 올바르지 않습니다.</p>}
            <button type="submit" className="w-full bg-[#03acb1] hover:bg-[#04c2c8] text-zinc-950 py-2.5 rounded-lg font-semibold text-sm transition-colors">
              로그인
            </button>
            <button type="button" onClick={onBack} className="w-full text-zinc-400 hover:text-zinc-200 py-2 text-sm transition-colors">
              돌아가기
            </button>
          </div>
        </form>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="min-h-dvh bg-zinc-950 text-zinc-100 py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={onBack} className="p-2 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors" aria-label="뒤로 가기">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm text-zinc-400">작품 정보 및 에피소드 데이터 매핑 관리</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-[#03acb1] hover:bg-[#04c2c8] disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 px-5 py-2.5 rounded-lg font-semibold transition-colors"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 sm:p-6 space-y-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b border-zinc-800 pb-3">
              <ImageIcon className="w-5 h-5 text-[#03acb1]" />
              Series Info &amp; Images
            </h2>

            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="title">Series Title <span className="text-red-400">*</span></label>
                <input id="title" type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="e.g., 장송의 프리렌" className={inputClass} />
              </div>

              <div>
                <label className={labelClass} htmlFor="description">Description</label>
                <textarea id="description" name="description" value={formData.description} onChange={handleInputChange} placeholder="작품에 대한 간단한 설명을 입력하세요." rows={3} className={`${inputClass} resize-none`} />
              </div>

              <div>
                <label className={labelClass} htmlFor="accentColor">Accent Color</label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    name="accentColor"
                    value={normalizeHex(formData.accentColor)}
                    onChange={handleInputChange}
                    className="h-10 w-14 rounded bg-zinc-950 border border-zinc-700 cursor-pointer"
                    aria-label="Accent color picker"
                  />
                  <input
                    id="accentColor"
                    type="text"
                    name="accentColor"
                    value={formData.accentColor}
                    onChange={handleInputChange}
                    className={`${inputClass} flex-1 ${accentValid ? '' : '!border-red-500'}`}
                    aria-invalid={!accentValid}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="youtubeBgmId">YouTube BGM ID</label>
                <input id="youtubeBgmId" type="text" name="youtubeBgmId" value={formData.youtubeBgmId} onChange={handleInputChange} placeholder="e.g., jfKfPfyJRdk (유튜브 영상 ID)" className={inputClass} />
              </div>

              <div className="grid grid-cols-[6rem_1fr] gap-4 items-start">
                <div>
                  <p className={labelClass}>Cover</p>
                  {formData.coverUrl ? (
                    <img src={formData.coverUrl} alt="Cover preview" className="h-32 w-24 rounded-md object-cover border border-zinc-700 bg-zinc-800" />
                  ) : (
                    <div className="h-32 w-24 bg-zinc-950 border border-dashed border-zinc-700 rounded-md flex items-center justify-center text-xs text-zinc-600">No Image</div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass} htmlFor="coverUrl">Cover Image URL (세로)</label>
                    <input id="coverUrl" type="url" name="coverUrl" value={formData.coverUrl} onChange={handleInputChange} placeholder="https://..." className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="bannerUrl">Banner Image URL (가로)</label>
                    <input id="bannerUrl" type="url" name="bannerUrl" value={formData.bannerUrl} onChange={handleInputChange} placeholder="https://..." className={inputClass} />
                  </div>
                </div>
              </div>
              {formData.bannerUrl ? (
                <img src={formData.bannerUrl} alt="Banner preview" className="h-24 w-full rounded-md object-cover border border-zinc-700 bg-zinc-800" />
              ) : (
                <div className="h-24 w-full bg-zinc-950 border border-dashed border-zinc-700 rounded-md flex items-center justify-center text-xs text-zinc-600">No Banner</div>
              )}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 sm:p-6 flex flex-col">
            <h2 className="text-lg font-semibold flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
              <Database className="w-5 h-5 text-emerald-400" />
              Episodes &amp; Volumes (JSON)
            </h2>
            <p className="text-xs text-zinc-400 mb-4">복잡한 에피소드와 챕터 매핑은 JSON 포맷으로 한 번에 붙여넣어 관리하는 것이 빠릅니다.</p>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              spellCheck={false}
              className="flex-1 min-h-[22rem] w-full bg-zinc-950 border border-zinc-700 rounded-lg p-4 text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500 resize-y"
              aria-label="JSON bulk import"
              aria-invalid={!json.ok}
            />
            <p role="status" className={`mt-3 flex items-start gap-2 text-xs ${json.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {json.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {json.ok ? json.summary : json.message}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
