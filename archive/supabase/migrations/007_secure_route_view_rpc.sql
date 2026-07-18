-- Restrict public route updates to a security-definer counter increment.
DROP POLICY IF EXISTS "Public routes can update view_count" ON routes;

CREATE OR REPLACE FUNCTION public.increment_route_view(target_route_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_count integer;
BEGIN
  UPDATE public.routes
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = target_route_id AND is_public = true
  RETURNING view_count INTO next_count;
  RETURN next_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_route_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_route_view(uuid) TO anon, authenticated;
