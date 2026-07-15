-- Ensure existing deployments expose application tables through PostgREST.
-- RLS remains the source of row-level authorization.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.walls, public.routes, public.ascents, public.comments, public.route_likes, public.profiles
  FROM anon;
GRANT SELECT ON TABLE public.walls, public.routes, public.ascents, public.comments, public.route_likes, public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.walls, public.routes, public.ascents, public.comments, public.route_likes, public.profiles
  TO authenticated;
GRANT ALL ON TABLE public.walls, public.routes, public.ascents, public.comments, public.route_likes, public.profiles TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_route_view(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO anon, authenticated;
