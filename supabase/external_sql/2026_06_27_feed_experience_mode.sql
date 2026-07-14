-- ============================================================
-- Feed Experience Mode (+18 only OR complete experience)
-- Persistido em profiles.feed_experience_mode
-- Valores: 'adult_only' | 'complete' | NULL (ainda não escolheu)
-- Realtime já está habilitado para public.profiles em
-- 2026_05_28_enable_profiles_realtime.sql — nada a fazer aqui.
-- Idempotente: roda quantas vezes quiser.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_experience_mode text DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'profiles_feed_experience_mode_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_feed_experience_mode_chk
      CHECK (feed_experience_mode IS NULL
          OR feed_experience_mode IN ('adult_only','complete'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.feed_experience_mode IS
  'Preferência do usuário: adult_only (apenas conteúdo +18) ou complete (experiência completa). Definido no modal de boas-vindas do Beta e alterável em /settings.';

NOTIFY pgrst, 'reload schema';
