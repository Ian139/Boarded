-- Server-owned moderator claim and RLS policies.
-- Moderation is derived from the signed app_metadata JWT claim; clients cannot
-- grant themselves moderator access by changing user metadata or local state.
CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'moderator', false)
      OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'is_moderator') = 'true', false);
$$;

REVOKE ALL ON FUNCTION public.is_moderator() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO anon, authenticated;

-- Moderators may manage content, while normal users remain owner-scoped.
DROP POLICY IF EXISTS "Moderators can update routes" ON routes;
CREATE POLICY "Moderators can update routes" ON routes
  FOR UPDATE TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());
DROP POLICY IF EXISTS "Moderators can delete routes" ON routes;
CREATE POLICY "Moderators can delete routes" ON routes
  FOR DELETE TO authenticated
  USING (public.is_moderator());

DROP POLICY IF EXISTS "Moderators can update walls" ON walls;
CREATE POLICY "Moderators can update walls" ON walls
  FOR UPDATE TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());
DROP POLICY IF EXISTS "Moderators can delete walls" ON walls;
CREATE POLICY "Moderators can delete walls" ON walls
  FOR DELETE TO authenticated
  USING (public.is_moderator());

DROP POLICY IF EXISTS "Moderators can delete comments" ON comments;
CREATE POLICY "Moderators can delete comments" ON comments
  FOR DELETE TO authenticated
  USING (public.is_moderator());
DROP POLICY IF EXISTS "Moderators can update comments" ON comments;
CREATE POLICY "Moderators can update comments" ON comments
  FOR UPDATE TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

DROP POLICY IF EXISTS "Moderators can delete ascents" ON ascents;
CREATE POLICY "Moderators can delete ascents" ON ascents
  FOR DELETE TO authenticated
  USING (public.is_moderator());

DROP POLICY IF EXISTS "Moderators can manage wall storage" ON storage.objects;
CREATE POLICY "Moderators can manage wall storage" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'walls' AND public.is_moderator())
  WITH CHECK (bucket_id = 'walls' AND public.is_moderator());
