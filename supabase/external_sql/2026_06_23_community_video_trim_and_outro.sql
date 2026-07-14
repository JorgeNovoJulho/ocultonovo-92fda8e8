-- ============================================================================
-- Comunidades — corte (trim) de vídeo + outro/marca d'água final
-- 100% idempotente. Rode no SQL Editor do Supabase externo.
-- ============================================================================

ALTER TABLE public.oculto_community_media
  ADD COLUMN IF NOT EXISTS trim_start_seconds numeric(10,3),
  ADD COLUMN IF NOT EXISTS trim_end_seconds   numeric(10,3),
  ADD COLUMN IF NOT EXISTS outro_url          text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'oculto_community_media_trim_chk'
  ) THEN
    ALTER TABLE public.oculto_community_media
      ADD CONSTRAINT oculto_community_media_trim_chk
      CHECK (
        trim_start_seconds IS NULL
        OR trim_end_seconds IS NULL
        OR trim_end_seconds > trim_start_seconds
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
