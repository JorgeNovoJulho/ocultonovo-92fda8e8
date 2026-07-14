-- ============================================================
-- HOTFIX: "Could not find the 'data' column of 'notifications'
-- in the schema cache" ao Acenar pelo Top Auras / Radar.
--
-- Garante (idempotente) que a tabela public.notifications tem
-- as colunas usadas em todo o frontend (`data`, `body`, `is_read`)
-- e força reload do schema cache do PostgREST.
-- Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS data    jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS body    text    NULL,
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notifications_data_gin
  ON public.notifications USING gin (data);

NOTIFY pgrst, 'reload schema';
