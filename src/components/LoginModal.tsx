// src/components/LoginModal.tsx
import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Clock, Loader2, RefreshCw, Sparkles } from 'lucide-react';

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefresh: () => Promise<void>;
  pendingApproval: boolean;
  /** 로그인은 됐지만 프로필 조회가 실패함 */
  profileError?: boolean;
  username?: string;
}

type Tab = 'login' | 'register';

const inputClass =
  'w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-base sm:text-sm text-zinc-100 ' +
  'focus:outline-none focus:border-[#03acb1] focus:ring-1 focus:ring-[#03acb1]/40 placeholder:text-zinc-500 transition-colors';

const primaryButton =
  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors ' +
  'bg-[#03acb1] hover:bg-[#04c2c8] text-zinc-950 disabled:opacity-50';

const Shell = ({ children }: { children: ReactNode }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="min-h-dvh flex items-center justify-center p-4 bg-zinc-950"
    style={{ background: 'radial-gradient(ellipse at top, rgba(3,172,177,0.10), transparent 60%), #09090b' }}
  >
    <div className="w-full max-w-sm bg-zinc-900/90 border border-zinc-800 rounded-2xl p-7 sm:p-8 space-y-6 shadow-2xl shadow-black/40">
      {children}
    </div>
  </motion.div>
);

export const LoginModal = ({ onLogin, onRegister, onLogout, onRefresh, pendingApproval, profileError, username: profileName }: Props) => {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // 이메일 인증이 켜진 프로젝트선 가입 직후 세션이 없으므로 로컬 상태로 대기 화면을 띄운다.
  const [justRegistered, setJustRegistered] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState('');

  const reset = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('아이디와 패스워드를 입력해주세요.');
      return;
    }
    if (username.includes('@') || /\s/.test(username.trim())) {
      setError('아이디에 @나 공백은 사용할 수 없습니다.');
      return;
    }
    if (tab === 'register') {
      if (password !== confirmPassword) { setError('패스워드가 일치하지 않습니다.'); return; }
      if (password.length < 6) { setError('패스워드는 6자 이상이어야 합니다.'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, password);
        setRegisteredUsername(username.trim());
        setJustRegistered(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Invalid login')) setError('아이디 또는 패스워드가 올바르지 않습니다.');
      else if (message.includes('already registered')) setError('이미 사용 중인 아이디입니다.');
      else setError(message || '오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = async () => {
    setJustRegistered(false);
    await onLogout();
    reset();
    setTab('login');
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // ── 승인 대기 / 프로필 오류 ────────────────────────────────────────────────
  if (pendingApproval || justRegistered || profileError) {
    const name = registeredUsername || profileName;
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className={`p-4 rounded-full border ${profileError ? 'bg-red-500/10 border-red-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
            {profileError ? <AlertTriangle className="w-8 h-8 text-red-400" /> : <Clock className="w-8 h-8 text-amber-400" />}
          </div>
          <h2 className="text-xl font-bold text-zinc-100">{profileError ? '계정 정보를 불러오지 못했어요' : '승인 대기 중'}</h2>
        </div>

        <div className="space-y-2 text-sm text-zinc-400 text-center">
          {profileError ? (
            <p>네트워크 상태를 확인한 뒤 다시 시도해주세요.</p>
          ) : (
            <>
              {name && (
                <p>
                  <span className="font-semibold text-zinc-200">{name}</span> 님의 가입 신청이 접수되었습니다.
                </p>
              )}
              <p>관리자 승인 후 이용하실 수 있습니다.</p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? '확인 중…' : profileError ? '다시 시도' : '승인 확인'}
          </button>
          <button onClick={backToLogin} className="w-full text-sm text-zinc-400 hover:text-zinc-200 transition-colors py-2">
            다른 계정으로 로그인
          </button>
        </div>
      </Shell>
    );
  }

  // ── 로그인 / 회원가입 ──────────────────────────────────────────────────────
  return (
    <Shell>
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="p-3 rounded-xl border" style={{ backgroundColor: 'rgba(3,172,177,0.08)', borderColor: 'rgba(3,172,177,0.25)' }}>
          <Sparkles className="w-6 h-6 text-[#03acb1]" />
        </div>
        <h1 className="text-xl font-bold text-zinc-100">AniMan</h1>
        <p className="text-sm text-zinc-500">애니메이션 ↔ 원작 만화 진도 트래커</p>
      </div>

      <div className="flex bg-zinc-950 rounded-lg p-1 gap-1" role="tablist">
        {(['login', 'register'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); reset(); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'login' ? '로그인' : '회원가입'}
          </button>
        ))}
      </div>

      <form className="space-y-3" onSubmit={handleSubmit} noValidate>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="아이디"
          aria-label="아이디"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="패스워드"
          aria-label="패스워드"
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          className={inputClass}
        />
        <AnimatePresence initial={false}>
          {tab === 'register' && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="패스워드 확인"
                aria-label="패스워드 확인"
                autoComplete="new-password"
                className={inputClass}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={primaryButton}>
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {tab === 'login' ? '로그인' : '가입 신청'}
        </button>
      </form>

      {tab === 'register' && <p className="text-xs text-center text-zinc-500">가입 후 관리자 승인이 필요합니다</p>}
    </Shell>
  );
};
