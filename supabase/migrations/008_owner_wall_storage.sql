-- Restrict wall objects to owner-prefixed paths: <auth.uid>/<wall-id>/<file>.
DROP POLICY IF EXISTS "Public insert for walls" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for walls" ON storage.objects;

CREATE POLICY "Owner-prefixed wall insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'walls'
    AND (storage.foldername(name))[1] = (select auth.uid()::text)
  );

CREATE POLICY "Owner-prefixed wall update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'walls' AND (storage.foldername(name))[1] = (select auth.uid()::text))
  WITH CHECK (bucket_id = 'walls' AND (storage.foldername(name))[1] = (select auth.uid()::text));

CREATE POLICY "Owner-prefixed wall delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'walls' AND (storage.foldername(name))[1] = (select auth.uid()::text));
