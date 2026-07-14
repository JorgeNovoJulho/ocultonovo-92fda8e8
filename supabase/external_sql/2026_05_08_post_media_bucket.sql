-- =====================================================================
-- Cria o bucket "post-media" no Supabase EXTERNO
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzm...).
-- Corrige o erro "Bucket not found" no fluxo de publicação de mídia VIP/PPV.
-- =====================================================================

-- 1. Criar bucket público (URLs públicas para mídia, controle de acesso via posts.is_locked)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-media',
  'post-media',
  true,
  524288000, -- 500MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies de storage.objects para post-media
DROP POLICY IF EXISTS "post-media public read" ON storage.objects;
CREATE POLICY "post-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-media');

DROP POLICY IF EXISTS "post-media auth upload" ON storage.objects;
CREATE POLICY "post-media auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'post-media');

DROP POLICY IF EXISTS "post-media owner update" ON storage.objects;
CREATE POLICY "post-media owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'post-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'post-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "post-media owner delete" ON storage.objects;
CREATE POLICY "post-media owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'post-media' AND owner = auth.uid());
