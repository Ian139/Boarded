-- Storage policies for walls bucket

-- Fresh stacks do not have storage buckets until one is explicitly created.
INSERT INTO storage.buckets (id, name, public)
VALUES ('walls', 'walls', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read access for walls" ON storage.objects;
DROP POLICY IF EXISTS "Public insert for walls" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete for walls" ON storage.objects;
-- Public read access for walls bucket
CREATE POLICY "Public read access for walls" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'walls');

-- Allow anyone to upload to walls bucket
CREATE POLICY "Public insert for walls" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'walls');

-- Allow authenticated users to delete objects in walls bucket
CREATE POLICY "Authenticated delete for walls" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'walls' AND auth.role() = 'authenticated');
