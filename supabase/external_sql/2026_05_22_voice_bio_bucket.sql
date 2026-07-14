-- =====================================================================
-- 2026-05-22 — Bucket "voice-bio" no Supabase EXTERNO
-- Corrige falha "Upload falhou após 3 tentativas" ao salvar bio em áudio.
-- O bucket "avatars" rejeita áudios (limite 10MB, MIME só imagem).
-- Idempotente. Rode no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

-- 1) Bucket público dedicado para bio em áudio (até 15 MB; WAV mono 30s ≈ 2,6 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-bio',
  'voice-bio',
  true,
  15728640, -- 15 MB
  ARRAY[
    'audio/wav','audio/x-wav','audio/wave',
    'audio/webm','audio/ogg',
    'audio/mpeg','audio/mp3',
    'audio/mp4','audio/x-m4a','audio/aac'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Policies (idempotentes — não usa DROP que exige owner do storage)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='voice-bio public read'
  ) THEN
    CREATE POLICY "voice-bio public read" ON storage.objects
      FOR SELECT USING (bucket_id = 'voice-bio');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='voice-bio auth upload'
  ) THEN
    CREATE POLICY "voice-bio auth upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'voice-bio');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='voice-bio owner update'
  ) THEN
    CREATE POLICY "voice-bio owner update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'voice-bio' AND owner = auth.uid())
      WITH CHECK (bucket_id = 'voice-bio' AND owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='voice-bio owner delete'
  ) THEN
    CREATE POLICY "voice-bio owner delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'voice-bio' AND owner = auth.uid());
  END IF;
END $$;

-- 3) Garante colunas em profiles (no-op se já existem)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_bio_url      text,
  ADD COLUMN IF NOT EXISTS voice_bio_duration integer;
