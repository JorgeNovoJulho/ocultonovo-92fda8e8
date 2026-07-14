-- =====================================================================
-- OCULTO PLAY — Suporte a corte (trim) e capa customizada de vídeo
-- Adiciona colunas idempotentes em oculto_play_items e oculto_play_drafts.
-- Pode ser executado várias vezes sem efeito colateral.
-- =====================================================================

-- Items publicados
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS trim_start_seconds numeric(10,3),
  ADD COLUMN IF NOT EXISTS trim_end_seconds   numeric(10,3),
  ADD COLUMN IF NOT EXISTS thumb_url          text;

-- Sanity: trim_start < trim_end quando ambos presentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'oculto_play_items_trim_chk'
  ) THEN
    ALTER TABLE public.oculto_play_items
      ADD CONSTRAINT oculto_play_items_trim_chk
      CHECK (
        trim_start_seconds IS NULL
        OR trim_end_seconds IS NULL
        OR trim_end_seconds > trim_start_seconds
      );
  END IF;
END $$;

-- Drafts (tabela opcional — só se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'oculto_play_drafts'
  ) THEN
    EXECUTE 'ALTER TABLE public.oculto_play_drafts
              ADD COLUMN IF NOT EXISTS trim_start_seconds numeric(10,3),
              ADD COLUMN IF NOT EXISTS trim_end_seconds   numeric(10,3),
              ADD COLUMN IF NOT EXISTS thumb_url          text';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
