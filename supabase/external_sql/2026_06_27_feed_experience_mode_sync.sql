-- ============================================================
-- Sincronia cross-device do modo de experiência do feed.
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente.
-- ============================================================

-- 1) Garante a coluna em profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_experience_mode text;

-- 2) Constraint de valores válidos (drop+create para idempotência).
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_feed_experience_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_feed_experience_mode_check
  CHECK (feed_experience_mode IS NULL OR feed_experience_mode IN ('adult_only','complete'));

-- 3) Default seguro: 'complete' (não restringe).
ALTER TABLE public.profiles
  ALTER COLUMN feed_experience_mode SET DEFAULT 'complete';

-- 4) Realtime: payload completo + publication ativa para profiles.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
