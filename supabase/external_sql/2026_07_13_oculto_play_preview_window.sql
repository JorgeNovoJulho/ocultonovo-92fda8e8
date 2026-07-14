-- =====================================================================
-- Oculto Play — RPC pública para janela de prévia do áudio (30s salvos)
-- Alvo: Supabase EXTERNO. Idempotente. Rodar no SQL Editor.
--
-- Corrige embed do feed que estava tocando desde o início da faixa
-- porque preview_start/end vinham nulos (RLS bloqueava SELECT direto e
-- oculto_play_guest_item nem sempre retorna esses campos).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_preview_window(p_item_id uuid)
RETURNS TABLE (
  item_id uuid,
  preview_start_seconds integer,
  preview_end_seconds   integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    i.id,
    COALESCE(i.preview_start_seconds, 0)::int,
    COALESCE(
      i.preview_end_seconds,
      COALESCE(i.preview_start_seconds, 0) + 30
    )::int
  FROM public.oculto_play_items i
  WHERE i.id = p_item_id
    AND i.published_at IS NOT NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_preview_window(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
