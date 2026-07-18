-- Persist the wall geometry captured with each route snapshot.
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS wall_image_width integer,
  ADD COLUMN IF NOT EXISTS wall_image_height integer;
