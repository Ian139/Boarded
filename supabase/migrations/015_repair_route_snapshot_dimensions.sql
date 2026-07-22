-- Repair route snapshot dimensions for deployments where migration 011 was
-- skipped, migration history drifted, or PostgREST retained a stale schema.
-- Keep this later migration independently safe for projects at any state.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS wall_image_width integer,
  ADD COLUMN IF NOT EXISTS wall_image_height integer;

-- Preserve route-specific snapshots, while filling dimensions from the matching
-- wall when the route has no snapshot URL or still references that wall URL.
UPDATE public.routes AS routes
SET
  wall_image_width = COALESCE(routes.wall_image_width, walls.image_width),
  wall_image_height = COALESCE(routes.wall_image_height, walls.image_height)
FROM public.walls AS walls
WHERE routes.wall_id = walls.id::text
  AND (routes.wall_image_width IS NULL OR routes.wall_image_height IS NULL)
  AND (routes.wall_image_url IS NULL OR routes.wall_image_url = walls.image_url);

NOTIFY pgrst, 'reload schema';
