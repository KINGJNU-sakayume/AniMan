// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { AdminFormData, AdminEpisodeInput, AdminVolumeInput, AdminSeasonInput } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[Supabase] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다.\n' +
    '.env.example을 참고하여 .env 파일을 생성하세요.'
  );
}

/** Singleton Supabase client. Use this throughout the app. */
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Converts a plain username to the internal email format used by Supabase Auth.
 * Users authenticate with a username, but Supabase requires an email, so we
 * append the `@animan.local` pseudo-domain.
 *
 * @param username - The raw username entered by the user.
 * @returns A synthetic email string, e.g. `"john@animan.local"`.
 */
const toEmail = (username: string) => `${username.trim().toLowerCase()}@animan.local`;

/**
 * Registers a new user account. New accounts start with `is_approved = false`
 * and must be approved by an admin before they can access the app.
 *
 * @param username - The desired username (no spaces or `@`).
 * @param password - Must be at least 6 characters.
 * @returns The Supabase `signUp` response object.
 */
export const signUp = (username: string, password: string) =>
  supabase.auth.signUp({
    email: toEmail(username),
    password,
    options: { data: { username } },
  });

/**
 * Signs an existing user in with their username and password.
 *
 * @param username - The user's username.
 * @param password - The user's password.
 * @returns The Supabase `signInWithPassword` response object.
 */
export const signIn = (username: string, password: string) =>
  supabase.auth.signInWithPassword({
    email: toEmail(username),
    password,
  });

/**
 * Signs the current user out and invalidates the session.
 *
 * @returns The Supabase `signOut` response object.
 */
export const signOut = () => supabase.auth.signOut();

/**
 * Fetches the profile row for a given user ID.
 * Uses `maybeSingle()` to return `null` safely when the profile does not exist
 * (rather than throwing).
 *
 * @param userId - The `auth.users.id` UUID of the user.
 * @returns The profile data `{ username, is_approved, role }`, or `null`.
 */
export const getProfile = async (userId: string) => {
  const { data } = await supabase
    .from('profiles')
    .select('username, is_approved, role')
    .eq('id', userId)
    .maybeSingle();
  return data;
};

/**
 * Inserts a complete series record (with all its seasons, episodes, and volumes)
 * into the database in a single logical operation.
 *
 * If any sub-insert fails, the newly created series row is deleted as a
 * best-effort rollback to avoid orphaned data.
 *
 * @param seriesData - Core series metadata (title, description, colors, URLs).
 * @param episodes - Array of episode objects to insert.
 * @param volumes - Array of volume objects to insert.
 * @param seasons - Optional array of season objects to insert.
 * @returns The UUID of the newly created series row.
 * @throws {PostgrestError} If any database operation fails.
 */
export const saveAdminData = async (
  seriesData: AdminFormData,
  episodes: AdminEpisodeInput[],
  volumes: AdminVolumeInput[],
  seasons: AdminSeasonInput[] = []
): Promise<string> => {
  const { data: series, error: seriesError } = await supabase
    .from('series')
    .insert([{
      title: seriesData.title,
      description: seriesData.description,
      accent_color: seriesData.accentColor,
      cover_url: seriesData.coverUrl,
      banner_url: seriesData.bannerUrl,
      youtube_bgm_id: seriesData.youtubeBgmId || null,
    }])
    .select()
    .single();

  if (seriesError) throw seriesError;
  const seriesId = series.id;

  try {
    if (seasons.length > 0) {
      const { error } = await supabase.from('seasons').insert(
        seasons.map((s) => ({
          series_id: seriesId,
          name: s.name,
          start_chapter: s.startChapter,
          end_chapter: s.endChapter ?? null,
        }))
      );
      if (error) throw error;
    }

    if (episodes.length > 0) {
      const { error } = await supabase.from('episodes').insert(
        episodes.map((ep) => ({
          series_id: seriesId,
          episode_number: ep.number,
          title: ep.title ?? null,
          start_chapter: ep.startChapter,
          end_chapter: ep.endChapter,
          cover_url: ep.cover_url ?? ep.coverUrl ?? null,
          duration: ep.duration ?? null,
        }))
      );
      if (error) throw error;
    }

    if (volumes.length > 0) {
      const { error } = await supabase.from('volumes').insert(
        volumes.map((vol) => ({
          series_id: seriesId,
          volume_number: vol.number,
          start_chapter: vol.startChapter,
          end_chapter: vol.endChapter,
          cover_url: vol.cover_url ?? vol.coverUrl ?? null,
        }))
      );
      if (error) throw error;
    }

    return seriesId;
  } catch (error) {
    await supabase.from('series').delete().eq('id', seriesId);
    throw error;
  }
};
