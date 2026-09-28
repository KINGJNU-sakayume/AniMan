// src/hooks/useAuth.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchProfile, signIn, signOut, signUp } from '../lib/auth';
import type { Profile } from '../types';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  /** 최초 세션 확인 중 */
  loading: boolean;
  /** 로그인은 됐지만 프로필을 불러오지 못함 (네트워크 등) */
  profileError: boolean;
}

/**
 * Supabase 인증 상태 + 승인(approval) 게이트.
 *
 * - onAuthStateChange 의 INITIAL_SESSION 이벤트로 초기 세션을 받으므로 getSession 을 따로 부르지 않는다.
 * - 토큰 갱신(TOKEN_REFRESHED)처럼 같은 사용자의 이벤트에서는 프로필을 다시 조회하지 않는다.
 */
export const useAuth = () => {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true, profileError: false });
  const currentUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (user: User) => {
    try {
      const profile = await fetchProfile(user.id);
      if (currentUserId.current !== user.id) return;
      setState({ user, profile, loading: false, profileError: false });
    } catch (err) {
      console.error('[useAuth] Failed to load profile:', err);
      if (currentUserId.current !== user.id) return;
      setState({ user, profile: null, loading: false, profileError: true });
    }
  }, []);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (!user) {
        currentUserId.current = null;
        setState({ user: null, profile: null, loading: false, profileError: false });
        return;
      }
      if (currentUserId.current === user.id) return;
      currentUserId.current = user.id;
      // 프로필을 받기 전까지는 로딩으로 두어 로그인 폼이 잠깐 다시 보이는 깜빡임을 막는다.
      setState({ user, profile: null, loading: true, profileError: false });
      // Supabase 콜백 안에서 다른 Supabase 호출을 await 하면 교착될 수 있어 비동기로 분리한다.
      void loadProfile(user);
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  /** 승인 대기 화면의 "승인 확인" 버튼용 */
  const refreshProfile = useCallback(async () => {
    if (state.user) await loadProfile(state.user);
  }, [state.user, loadProfile]);

  const login = useCallback(async (username: string, password: string) => {
    const { error } = await signIn(username, password);
    if (error) throw error;
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { error } = await signUp(username, password);
    if (error) throw error;
  }, []);

  const logout = useCallback(async () => {
    await signOut();
  }, []);

  const { user, profile } = state;
  return {
    user,
    profile,
    loading: state.loading,
    profileError: state.profileError,
    // 프로필 행이 아예 없는 경우도 관리자 조치가 필요하므로 승인 대기로 취급한다.
    pendingApproval: user != null && !state.profileError && profile?.is_approved !== true,
    isApproved: user != null && profile?.is_approved === true,
    isAdmin: user != null && profile?.role === 'admin',
    login,
    register,
    logout,
    refreshProfile,
  };
};
