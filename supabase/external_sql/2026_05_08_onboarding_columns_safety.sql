-- ============================================================
-- Etapa 4: Garantia idempotente das colunas de Onboarding em profiles
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Seguro: ADD COLUMN IF NOT EXISTS — não altera dados existentes.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_forever boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_current_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_intent text,
  ADD COLUMN IF NOT EXISTS onboarding_hide_until timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_last_seen_at timestamptz;

-- check intent value (only allow known)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_onboarding_intent_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_onboarding_intent_chk
      CHECK (onboarding_intent IS NULL OR onboarding_intent IN ('creator','user'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
