-- =====================================================================
-- 2026-05-09 — Storage buckets do Canal VIP (versão segura para Supabase)
-- Sem ALTER TABLE storage.objects e sem DROP POLICY (evita erro 42501).
-- Idempotente.
-- =====================================================================

-- 1) Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('post-media',      'post-media',      true,  524288000, NULL),
  ('media',           'media',           true,  104857600, NULL),
  ('avatars',         'avatars',         true,  10485760,  ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('plan-banners',    'plan-banners',    true,  20971520,  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']),
  ('founder-media',   'founder-media',   false, 209715200, NULL),
  ('chat-media',      'chat-media',      false, 104857600, NULL),
  ('safety-evidence', 'safety-evidence', false, 104857600, NULL),
  ('attachments',     'attachments',     false, 52428800,  NULL),
  ('verifications',   'verifications',   false, 52428800,  NULL),
  ('kyc-documents',   'kyc-documents',   false, 52428800,  NULL),
  ('email-assets',    'email-assets',    true,  10485760,  NULL)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Policies — só cria se ainda não existir (não dropa nada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='oculto_v2_public_read'
  ) THEN
    CREATE POLICY "oculto_v2_public_read" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id IN ('post-media','media','avatars','plan-banners','email-assets'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='oculto_v2_auth_insert'
  ) THEN
    CREATE POLICY "oculto_v2_auth_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id IN (
          'post-media','media','avatars','plan-banners',
          'chat-media','safety-evidence','attachments',
          'verifications','kyc-documents','founder-media'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='oculto_v2_auth_update_own'
  ) THEN
    CREATE POLICY "oculto_v2_auth_update_own" ON storage.objects
      FOR UPDATE TO authenticated
      USING (owner = auth.uid())
      WITH CHECK (owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='oculto_v2_auth_delete_own'
  ) THEN
    CREATE POLICY "oculto_v2_auth_delete_own" ON storage.objects
      FOR DELETE TO authenticated
      USING (owner = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='oculto_v2_auth_read_own_private'
  ) THEN
    CREATE POLICY "oculto_v2_auth_read_own_private" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id IN ('chat-media','safety-evidence','attachments','verifications','kyc-documents','founder-media')
        AND owner = auth.uid()
      );
  END IF;
END $$;
