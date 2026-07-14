-- ============================================================
-- 2026-06-10 — Modos de Visualização do Feed: coluna `widgets`
-- ============================================================
-- Adiciona override granular (por modo) de quais widgets aparecem
-- no feed. NULL = usa o default definido em modes.config.ts.
-- Idempotente — execute no SQL Editor do Supabase EXTERNO.
-- ============================================================

ALTER TABLE public.oculto_feed_modes_config
  ADD COLUMN IF NOT EXISTS widgets jsonb;

COMMENT ON COLUMN public.oculto_feed_modes_config.widgets IS
  'Override admin: mapa { widget_key: boolean } controlando quais widgets aparecem neste modo. NULL = usa default do código.';

-- Realtime já está habilitado para esta tabela. Garante REPLICA IDENTITY
-- FULL para o cliente receber o payload completo no UPDATE.
ALTER TABLE public.oculto_feed_modes_config REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
