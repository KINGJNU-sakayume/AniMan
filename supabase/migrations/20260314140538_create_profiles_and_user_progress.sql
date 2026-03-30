/*
  # Create profiles and user_progress tables

  ## Summary
  This migration adds two tables required by the authentication and progress-tracking
  features that are already implemented in the frontend but were missing from the DB.

  ## New Tables

  ### profiles
  - `id` (uuid, PK) — references auth.users(id), so each profile maps 1-to-1 with a Supabase Auth user
  - `username` (text, unique) — display name derived from signup
  - `is_approved` (boolean, default false) — admin manually flips this to grant access
  - `role` (text, default 'user') — future-proofing for role-based access
  - `created_at` (timestamptz)

  ### user_progress
  - `id` (uuid, PK)
  - `user_id` (uuid) — references profiles(id) with CASCADE delete
  - `series_id` (uuid) — references series(id) with CASCADE delete
  - `completed_ids` (text[]) — array of episode/volume IDs the user has marked complete
  - `updated_at` (timestamptz)
  - Unique constraint on (user_id, series_id) — one progress row per user per series

  ## Security
  - RLS enabled on both tables
  - profiles: users can read and update their own row; no public reads
  - user_progress: users can fully manage only their own rows
  - A trigger auto-creates a profile row on new auth.users signup
*/

-- ── profiles ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    text        UNIQUE NOT NULL,
  is_approved boolean     NOT NULL DEFAULT false,
  role        text        NOT NULL DEFAULT 'user',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles"
  ON profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Auto-create profile on signup ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, is_approved, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    false,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── user_progress ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_progress (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  series_id     uuid        NOT NULL REFERENCES series(id)   ON DELETE CASCADE,
  completed_ids text[]      NOT NULL DEFAULT '{}',
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(user_id, series_id)
);

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress"
  ON user_progress FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON user_progress FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON user_progress FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own progress"
  ON user_progress FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_progress_user     ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_series   ON user_progress(series_id);
