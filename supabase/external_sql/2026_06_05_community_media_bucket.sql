-- ============================================================
-- COMUNIDADES OCULTAS — bucket 'community-media' (privado)
-- Fix: "Falha ao enviar imagem" no modal Criar comunidade.
-- As policies já existem em part4; aqui só garantimos o bucket.
-- Idempotente · Supabase Externo
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-media',
  'community-media',
  false,
  52428800, -- 50MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'video/mp4','video/webm','video/quicktime',
    'audio/webm','audio/mpeg','audio/mp4','audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
