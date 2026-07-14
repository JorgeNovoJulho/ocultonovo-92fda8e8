-- ============================================================
-- Adiciona coluna is_seed em public_activities (idempotente)
-- Resolve warning "[Activities] 42703" no console.
-- Cole no SQL Editor do Supabase externo (rvybbrkzmboqbhcemqar).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='public_activities') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='public_activities' AND column_name='is_seed'
    ) THEN
      ALTER TABLE public.public_activities ADD COLUMN is_seed boolean NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS idx_public_activities_is_seed ON public.public_activities (is_seed) WHERE is_seed = false;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
