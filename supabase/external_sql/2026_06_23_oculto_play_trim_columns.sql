-- =====================================================================
-- 2026-06-23 — Adiciona colunas de corte (trim) ao Oculto Play
-- Corrige erro: "Could not find the 'trim_end_seconds' column of
-- 'oculto_play_items' in the schema cache".
-- Executar no SQL Editor do Supabase EXTERNO. Idempotente.
-- =====================================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS trim_start_seconds numeric(10,3) NULL,
  ADD COLUMN IF NOT EXISTS trim_end_seconds   numeric(10,3) NULL;

COMMENT ON COLUMN public.oculto_play_items.trim_start_seconds IS
  'Início do corte do vídeo em segundos (NULL = começo do arquivo).';
COMMENT ON COLUMN public.oculto_play_items.trim_end_seconds IS
  'Fim do corte do vídeo em segundos (NULL = fim do arquivo).';

-- Recarrega o cache do PostgREST para que o schema novo seja visível imediatamente.
NOTIFY pgrst, 'reload schema';
