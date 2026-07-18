-- Storage bucket + policies for avatars

-- Ensure avatars bucket exists and is publicly readable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public;

-- RLS is already enabled on storage.objects in most Supabase projects.
-- Keep this defensive in case the executing role does not own the table.
DO $$
BEGIN
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping ALTER TABLE storage.objects ENABLE RLS (insufficient privilege)';
END
$$;

-- Recreate policies idempotently.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Public read access for avatars" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping DROP POLICY Public read access for avatars (insufficient privilege)';
END
$$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated insert for avatars" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping DROP POLICY Authenticated insert for avatars (insufficient privilege)';
END
$$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated update for avatars" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping DROP POLICY Authenticated update for avatars (insufficient privilege)';
END
$$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated delete for avatars" ON storage.objects;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping DROP POLICY Authenticated delete for avatars (insufficient privilege)';
END
$$;

-- Anyone can read files in avatars bucket.
DO $$
BEGIN
  CREATE POLICY "Public read access for avatars" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'avatars');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE POLICY Public read access for avatars (insufficient privilege)';
END
$$;

-- Authenticated users can only write to their own folder: avatars/<auth.uid()>/...
DO $$
BEGIN
  CREATE POLICY "Authenticated insert for avatars" ON storage.objects
    FOR INSERT
    WITH CHECK (
      bucket_id = 'avatars'
      AND auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE POLICY Authenticated insert for avatars (insufficient privilege)';
END
$$;

DO $$
BEGIN
  CREATE POLICY "Authenticated update for avatars" ON storage.objects
    FOR UPDATE
    USING (
      bucket_id = 'avatars'
      AND auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE POLICY Authenticated update for avatars (insufficient privilege)';
END
$$;

DO $$
BEGIN
  CREATE POLICY "Authenticated delete for avatars" ON storage.objects
    FOR DELETE
    USING (
      bucket_id = 'avatars'
      AND auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping CREATE POLICY Authenticated delete for avatars (insufficient privilege)';
END
$$;
