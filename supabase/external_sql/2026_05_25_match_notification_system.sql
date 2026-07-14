-- ============================================================================
-- MATCH NOTIFICATION SYSTEM (som + vibração quando ocorre match)
-- Idempotente. Rodar no SQL Editor do Supabase externo (rvybbrkzmboqbhcemqar).
-- ============================================================================

-- 1) Bucket público para os arquivos sonoros (admin master gerencia, todos leem)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'match-sounds',
  'match-sounds',
  true,
  5242880, -- 5MB por arquivo
  ARRAY['audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/webm','audio/aac','audio/x-m4a','audio/mp4']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies do bucket
DROP POLICY IF EXISTS "match_sounds_public_read" ON storage.objects;
CREATE POLICY "match_sounds_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'match-sounds');

DROP POLICY IF EXISTS "match_sounds_master_write" ON storage.objects;
CREATE POLICY "match_sounds_master_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'match-sounds'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

DROP POLICY IF EXISTS "match_sounds_master_update" ON storage.objects;
CREATE POLICY "match_sounds_master_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'match-sounds'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

DROP POLICY IF EXISTS "match_sounds_master_delete" ON storage.objects;
CREATE POLICY "match_sounds_master_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'match-sounds'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

-- 2) Tabela de biblioteca de sons (vários arquivos podem ficar salvos)
CREATE TABLE IF NOT EXISTS public.oculto_match_sounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  file_url     text NOT NULL,
  file_path    text NOT NULL,                -- caminho no bucket (para deletar)
  mime_type    text,
  size_bytes   bigint,
  duration_ms  integer,
  uploaded_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_match_sounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_sounds_authenticated_read" ON public.oculto_match_sounds;
CREATE POLICY "match_sounds_authenticated_read" ON public.oculto_match_sounds
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "match_sounds_master_insert" ON public.oculto_match_sounds;
CREATE POLICY "match_sounds_master_insert" ON public.oculto_match_sounds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

DROP POLICY IF EXISTS "match_sounds_master_delete" ON public.oculto_match_sounds;
CREATE POLICY "match_sounds_master_delete" ON public.oculto_match_sounds
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

-- 3) Tabela singleton de configurações (id fixo = 1)
CREATE TABLE IF NOT EXISTS public.oculto_match_notification_settings (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sound_enabled       boolean NOT NULL DEFAULT true,
  vibration_enabled   boolean NOT NULL DEFAULT true,
  volume              numeric(3,2) NOT NULL DEFAULT 0.80 CHECK (volume >= 0 AND volume <= 1),
  active_sound_id     uuid REFERENCES public.oculto_match_sounds(id) ON DELETE SET NULL,
  vibration_pattern   jsonb NOT NULL DEFAULT '[120, 60, 180, 60, 240]'::jsonb,
  updated_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.oculto_match_notification_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_match_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "match_settings_authenticated_read" ON public.oculto_match_notification_settings;
CREATE POLICY "match_settings_authenticated_read" ON public.oculto_match_notification_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "match_settings_master_update" ON public.oculto_match_notification_settings;
CREATE POLICY "match_settings_master_update" ON public.oculto_match_notification_settings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    )
  );

-- Garantir realtime (opcional)
ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_match_notification_settings;
