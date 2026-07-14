-- ============================================================
-- CHAT-MEDIA BUCKET — público, com policies de upload por usuário autenticado
-- Idempotente · Supabase Externo
-- Fix: "Bucket not found" ao enviar PDF/imagem no chat.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  104857600, -- 100MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif','image/bmp',
    'video/mp4','video/webm','video/quicktime',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat-media public read" ON storage.objects;
CREATE POLICY "chat-media public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat-media auth upload" ON storage.objects;
CREATE POLICY "chat-media auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

DROP POLICY IF EXISTS "chat-media owner update" ON storage.objects;
CREATE POLICY "chat-media owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'chat-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "chat-media owner delete" ON storage.objects;
CREATE POLICY "chat-media owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-media' AND owner = auth.uid());
