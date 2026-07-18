-- Legacy wall objects may still use <wall-id>/<file> paths. A SQL metadata
-- rename does not move the underlying Storage object, so leave these objects
-- untouched and readable by the moderator cleanup policy. New uploads use the
-- owner-prefixed <auth.uid>/<wall-id>/<file> layout from migration 008.
-- A future service-role maintenance job may copy objects with the Storage API,
-- then update walls.image_url/routes.wall_image_url atomically.
DROP POLICY IF EXISTS "Moderators can manage legacy wall storage" ON storage.objects;
CREATE POLICY "Moderators can manage legacy wall storage" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'walls'
    AND public.is_moderator()
    AND array_length(storage.foldername(name), 1) <= 2
  )
  WITH CHECK (
    bucket_id = 'walls'
    AND public.is_moderator()
  );
