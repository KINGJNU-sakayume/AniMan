// src/components/LoginModal.tsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, UserPlus, Loader2, Clock, RefreshCw } from 'lucide-react';

interface Props {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  onLogout: () => void;        // 버그2: 대기 화면 → 로그아웃 후 로그인 화면으로
  onRefresh: () => Promise<void>; // 버그1: 승인 여부 재확인
  pendingApproval: boolean;
}

type Tab = 'login' | 'register';

export const LoginModal = ({ onLogin, onRegister, onLogout, onRefresh, pendingApproval }: Props) => {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // 가입 성공 후 로컬 상태 — pendingApproval(부모)와 별개로 관리
  const [justRegistered, setJustRegistered] = useState(false);
  const [registeredUsername, setRegisteredUsername] = useState('');

  const reset = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const handleTabChange = (t: Tab) => {
    setTab(t);
    reset();
  };

  const handleSubmit = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('아이디와 패스워드를 입력해주세요.');
      return;
    }
    if (username.includes('@') || username.includes(' ')) {
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
        setRegisteredUsername(username);
        setJustRegistered(true);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('Invalid login')) {
          setError('아이디 또는 패스워드가 올바르지 않습니다.');
        } else if (err.message.includes('already registered')) {
          setError('이미 사용 중인 아이디입니다.');
        } else {
          setError(err.message);
        }
      } else {
        setError('오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── 승인 대기 화면 ──────────────────────────────────────────────────────────
  // pendingApproval(부모 prop) 또는 방금 가입한 경우 표시
  if (pendingApproval || justRegistered) {
    const handleBackToLogin = async () => {
      // 버그2 수정: 세션을 완전히 초기화한 뒤 로그인 화면으로
      setJustRegistered(false);
      await onLogout();
      reset();
      setTab('login');
    };

    const handleRefresh = async () => {
      setRefreshing(true);
      await onRefresh();
      setRefreshing(false);
      // onRefresh 후 pendingApproval이 false가 되면 부모에서 자동으로 앱으로 진입
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/95 backdrop-blur-xl"
      >
        <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <Clock className="w-8 h-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-100">승인 대기 중</h2>
          </div>

          <div className="space-y-2 text-sm text-gray-400">
            {(justRegistered && registeredUsername) && (
              <p>
                <span className="font-semibold text-gray-200">{registeredUsername}</span> 님의
                가입 신청이 접수되었습니다.
              </p>
            )}
            <p>관리자 승인 후 이용하실 수 있습니다.</p>
          </div>

          <div className="space-y-2">
            {/* 버그1 수정: 승인 여부 재확인 버튼 */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg
                bg-amber-500/10 border border-amber-500/20 text-amber-400
                hover:bg-amber-500/20 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '확인 중…' : '승인 확인'}
            </button>

            {/* 버그2 수정: 로그아웃 후 로그인 화면으로 */}
            <button
              onClick={handleBackToLogin}
              className="w-full text-sm text-zinc-600 hover:text-zinc-400 transition-colors py-1"
            >
              다른 계정으로 로그인
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── 로그인 / 회원가입 화면 ──────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/95 backdrop-blur-xl"
    >
      <div className="w-full max-w-xs bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="p-3 bg-zinc-800 rounded-full">
            {tab === 'login'
              ? <Lock className="w-6 h-6 text-indigo-400" />
              : <UserPlus className="w-6 h-6 text-emerald-400" />}
          </div>
          <h2 className="text-xl font-bold text-gray-100">AniMan</h2>
        </div>

        {/* 탭 */}
        <div className="flex bg-zinc-950 rounded-lg p-1 gap-1">
          {(['login', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-zinc-700 text-gray-100' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        {/* 폼 */}
        <div className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="아이디"
            autoFocus
            autoComplete="username"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm
              text-gray-100 focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="패스워드"
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm
              text-gray-100 focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
          />
          <AnimatePresence>
            {tab === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  placeholder="패스워드 확인"
                  autoComplete="new-password"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm
                    text-gray-100 focus:outline-none focus:border-indigo-500 placeholder:text-zinc-600"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400">
              {error}
            </motion.p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium
              text-sm transition-colors text-white disabled:opacity-50 ${
              tab === 'login' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === 'login' ? '로그인' : '가입 신청'}
          </button>
        </div>

        {tab === 'register' && (
          <p className="text-xs text-center text-zinc-600">가입 후 관리자 승인이 필요합니다</p>
        )}
      </div>
    </motion.div>
  );
};