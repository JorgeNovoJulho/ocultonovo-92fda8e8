-- Make founder-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'founder-media';

-- Drop the permissive anonymous upload policy
DROP POLICY IF EXISTS "Anyone can upload founder media" ON storage.objects;

-- Ensure authenticated-only policies exist (from original migration)
-- Re-create if needed (idempotent with DROP IF EXISTS first)
DROP POLICY IF EXISTS "Users upload own founder media" ON storage.objects;
CREATE POLICY "Users upload own founder media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'founder-media' 
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users view own founder media" ON storage.objects;
CREATE POLICY "Users view own founder media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'founder-media' 
    AND (
      auth.uid()::text = (storage.foldername(name))[1] 
      OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins delete founder media" ON storage.objects;
CREATE POLICY "Admins delete founder media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'founder-media' 
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );