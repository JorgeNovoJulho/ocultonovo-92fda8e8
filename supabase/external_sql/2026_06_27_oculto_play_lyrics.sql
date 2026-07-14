-- =====================================================================
-- Oculto Play — Letras de música (lyrics)
-- Adiciona coluna opcional `lyrics` em oculto_play_items para guardar
-- a letra completa da música (pode ser enviada via arquivo .txt ou
-- digitada/colada manualmente no modal de upload).
-- Idempotente — pode ser reexecutado sem efeitos colaterais.
-- =====================================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS lyrics text;

COMMENT ON COLUMN public.oculto_play_items.lyrics IS
  'Letra da música (texto livre, preserva quebras de linha). Exibida no FocusModal de áudio ao clicar 2x na capa.';
