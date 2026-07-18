-- Store the selected wall image on each route for fast list/detail rendering.
-- Existing routes are backfilled from their linked wall when wall_id points to a real wall row.

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS wall_image_url TEXT;

UPDATE routes
SET wall_image_url = walls.image_url
FROM walls
WHERE routes.wall_image_url IS NULL
  AND routes.wall_id = walls.id::text;
