// src/lib/auth.ts
import { supabase } from './supabase';
import type { Profile } from '../types';

/**
 * Supabase Auth 는 이메일을 요구하므로 아이디를 `{username}@animan.local` 형태로 변환해 쓴다.
 * 사용자는 이 변환을 의식하지 않는다.
 */
const toEmail = (username: string) => `${username.trim().toLowerCase()}@animan.local`;

/** 새 계정은 is_approved = false 로 시작하며 관리자 승인이 필요하다. */
export const signUp = (username: string, password: string) =>
  supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: { data: { username: username.trim() } },
  });

export const signIn = (username: string, password: string) =>
  supabase.auth.signInWithPassword({ email: toEmail(username), password });

export const signOut = () => supabase.auth.signOut();

/** 프로필 행. 행이 없으면 null, 네트워크/권한 오류는 throw. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username, is_approved, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
