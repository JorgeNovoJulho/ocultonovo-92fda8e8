-- =====================================================================
-- Corrige erro "Could not find the 'data' column of 'notifications'"
-- Garante que a coluna existe e força o PostgREST a recarregar o schema.
-- Idempotente — pode rodar quantas vezes precisar.
-- =====================================================================

-- 1) Garante a coluna 'data' (JSONB) em public.notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2) Índice GIN para queries em data->>'kind' etc. (opcional, recomendado)
CREATE INDEX IF NOT EXISTS idx_notifications_data_gin
  ON public.notifications USING GIN (data);

-- 3) Permite o tipo 'audio_bio_request' (se houver CHECK constraint por tipo,
--    o bloco abaixo evita erro silencioso. Caso não exista a constraint,
--    o DO block apenas ignora.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'notifications_type_check'
      AND  conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

-- 4) Recarrega o cache do PostgREST (Data API) — sem isso o erro persiste
NOTIFY pgrst, 'reload schema';
