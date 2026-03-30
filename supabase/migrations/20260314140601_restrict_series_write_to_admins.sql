/*
  # Restrict series/seasons/episodes/volumes writes to admin users only

  ## Summary
  The previous migration allowed any authenticated user to insert and delete content
  tables (series, seasons, episodes, volumes). This migration replaces those permissive
  policies with admin-only checks, using the profiles.role column.

  ## Changes
  - Drop old permissive insert/delete policies on series, seasons, episodes, volumes
  - Add new policies that check profiles.role = 'admin' for all write operations

  ## Security
  - Only users whose profiles.role is 'admin' can insert or delete content rows
  - Read access remains open to anon + authenticated (unchanged)
*/

-- Drop old permissive write policies
DROP POLICY IF EXISTS "auth insert series"   ON series;
DROP POLICY IF EXISTS "auth insert seasons"  ON seasons;
DROP POLICY IF EXISTS "auth insert episodes" ON episodes;
DROP POLICY IF EXISTS "auth insert volumes"  ON volumes;

DROP POLICY IF EXISTS "auth delete series"   ON series;
DROP POLICY IF EXISTS "auth delete seasons"  ON seasons;
DROP POLICY IF EXISTS "auth delete episodes" ON episodes;
DROP POLICY IF EXISTS "auth delete volumes"  ON volumes;

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Admin-only insert policies
CREATE POLICY "admin insert series"   ON series   FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin insert seasons"  ON seasons  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin insert episodes" ON episodes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admin insert volumes"  ON volumes  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Admin-only delete policies
CREATE POLICY "admin delete series"   ON series   FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "admin delete seasons"  ON seasons  FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "admin delete episodes" ON episodes FOR DELETE TO authenticated USING (public.is_admin());
CREATE POLICY "admin delete volumes"  ON volumes  FOR DELETE TO authenticated USING (public.is_admin());

-- Admin-only update policies
CREATE POLICY "admin update series"   ON series   FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin update seasons"  ON seasons  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin update episodes" ON episodes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "admin update volumes"  ON volumes  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
