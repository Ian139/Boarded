-- Ensure upgrades that already applied the original storage policy migration
-- still have the public walls bucket and complete route snapshot dimensions.
INSERT INTO storage.buckets (id, name, public)
VALUES ('walls', 'walls', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Rewrite migrated route image references only when the matching bucket/object
-- exists in this project. Route-specific snapshots remain untouched; copying
-- legacy objects must happen through the Storage API first.
UPDATE public.routes AS routes
SET wall_image_url = walls.image_url
FROM public.walls AS walls
WHERE routes.wall_id = walls.id::text
  AND routes.wall_image_url IS DISTINCT FROM walls.image_url
  AND split_part(split_part(routes.wall_image_url, '/storage/v1/object/public/', 2), '?', 1)
    = split_part(split_part(walls.image_url, '/storage/v1/object/public/', 2), '?', 1)
  AND EXISTS (
    SELECT 1
    FROM storage.objects AS objects
    WHERE objects.bucket_id = 'walls'
      AND split_part(split_part(split_part(walls.image_url, '/storage/v1/object/public/', 2), '?', 1), '/', 1) = 'walls'
      AND objects.name = regexp_replace(
        split_part(split_part(walls.image_url, '/storage/v1/object/public/', 2), '?', 1),
        '^walls/',
        ''
      )
  );

UPDATE public.routes AS routes
SET
  wall_image_width = COALESCE(routes.wall_image_width, walls.image_width),
  wall_image_height = COALESCE(routes.wall_image_height, walls.image_height)
FROM public.walls AS walls
WHERE routes.wall_id = walls.id::text
  AND (routes.wall_image_width IS NULL OR routes.wall_image_height IS NULL)
  AND (routes.wall_image_url IS NULL OR routes.wall_image_url = walls.image_url);
