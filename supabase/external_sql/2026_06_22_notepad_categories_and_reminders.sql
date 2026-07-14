-- =====================================================================
-- 2026_06_22 — Bloco de Notas: categorias + lembretes
-- Adiciona `category` (idea/project/personal/other) e `reminder_at`
-- à tabela oculto_user_notes. Idempotente.
-- Execute no SQL Editor do Supabase EXTERNO.
-- =====================================================================

ALTER TABLE public.oculto_user_notes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz NULL;

-- Garantir valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oculto_user_notes_category_chk'
  ) THEN
    ALTER TABLE public.oculto_user_notes
      ADD CONSTRAINT oculto_user_notes_category_chk
      CHECK (category IN ('idea','project','personal','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_user_notes_reminder
  ON public.oculto_user_notes (user_id, reminder_at)
  WHERE reminder_at IS NOT NULL;
