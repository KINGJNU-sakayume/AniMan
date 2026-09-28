// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 환경변수가 없으면 모듈 로드 시점에 throw 하는 대신 false 를 노출한다.
 * (throw 하면 ErrorBoundary 바깥에서 터져 빈 흰 화면만 남는다) App 이 안내 화면을 띄운다.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/** Singleton Supabase client. Use this throughout the app. */
export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.invalid',
  supabaseKey || 'unconfigured',
);
