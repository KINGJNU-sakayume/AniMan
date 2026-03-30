// src/hooks/useAuth.ts
import { useEffect, useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase, signIn, signUp, signOut, getProfile } from '../lib/supabase';

/** User profile data fetched from the `profiles` table. */
interface Profile {
  username: string;
  is_approved: boolean;
  role: string;
}

/** Internal auth state managed by the hook. */
interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

/**
 * Manages Supabase authentication state for the application.
 *
 * Handles session persistence, profile loading, and approval gating.
 * Subscribes to `onAuthStateChange` for real-time session updates.
 *
 * @returns An object containing:
 *   - `session` — The current Supabase session, or null if unauthenticated.
 *   - `profile` — The user's profile row from the `profiles` table.
 *   - `loading` — True while the initial session check is in progress.
 *   - `pendingApproval` — True when the user is logged in but not yet approved.
 *   - `isApproved` — True when the user is logged in and approved.
 *   - `login` — Signs in with username + password.
 *   - `register` — Creates a new account (leaves user in pending-approval state).
 *   - `logout` — Signs out and clears the session.
 *   - `refreshProfile` — Re-fetches the profile from DB (for the approval-check button).
 */
export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
  });

  /**
   * Fetches the profile for the given session's user and updates state.
   * @param session - A valid Supabase session object.
   */
  const loadProfile = useCallback(async (session: Session) => {
    const profile = await getProfile(session.user.id);
    setState({ session, profile, loading: false });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        loadProfile(data.session);
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      (async () => {
        if (session) {
          await loadProfile(session);
        } else {
          setState({ session: null, profile: null, loading: false });
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, [loadProfile]);

  /**
   * Re-fetches the current user's profile from the database.
   * Used by the pending-approval screen to check if the admin has approved.
   */
  const refreshProfile = useCallback(async () => {
    if (!state.session) return;
    await loadProfile(state.session);
  }, [state.session, loadProfile]);

  /**
   * Signs in the user with their username and password.
   * @param username - The user's plain username (no email suffix).
   * @param password - The user's password.
   * @throws {AuthError} If the credentials are invalid.
   */
  const login = async (username: string, password: string) => {
    const { error } = await signIn(username, password);
    if (error) throw error;
  };

  /**
   * Registers a new account. The account starts in a pending-approval state.
   * @param username - Desired username.
   * @param password - Must be at least 6 characters.
   * @throws {AuthError} If the username is already taken or the request fails.
   */
  const register = async (username: string, password: string) => {
    const { error } = await signUp(username, password);
    if (error) throw error;
  };

  /** Signs the current user out and clears the session. */
  const logout = () => signOut();

  const pendingApproval = state.session != null && state.profile != null && !state.profile.is_approved;
  const isApproved = state.session != null && state.profile?.is_approved === true;

  return {
    session: state.session,
    profile: state.profile,
    loading: state.loading,
    pendingApproval,
    isApproved,
    login,
    register,
    logout,
    refreshProfile,
  };
};
