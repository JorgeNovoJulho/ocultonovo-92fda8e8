-- =====================================================================
-- OCULTO PLAY — Correção definitiva do trecho de 30s no feed principal
-- Alvo: Supabase EXTERNO. Idempotente. Rodar no SQL Editor.
--
-- Problema: o embed do feed recebia a URL do áudio completo sem a URL física
-- do snippet (`audio_preview_url`), então alguns browsers tocavam do início
-- da faixa antes/apesar do seek para preview_start_seconds.
--
-- Solução: RPC pública e mínima para retornar a fonte correta do preview:
-- 1) `audio_preview_url` quando existir (arquivo já recortado de até 30s)
-- 2) janela start/end para fallback com seek/media-fragment no áudio completo
-- =====================================================================

DROP FUNCTION IF EXISTS public.oculto_play_preview_window(uuid);

CREATE OR REPLACE FUNCTION public.oculto_play_preview_window(p_item_id uuid)
RETURNS TABLE (
  item_id uuid,
  audio_preview_url text,
  preview_start_seconds numeric,
  preview_end_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS item_id,
    i.audio_preview_url,
    CASE
      WHEN i.audio_preview_url IS NOT NULL AND length(trim(i.audio_preview_url)) > 0 THEN 0::numeric
      ELSE COALESCE(i.preview_start_seconds, 0)::numeric
    END AS preview_start_seconds,
    CASE
      WHEN i.audio_preview_url IS NOT NULL AND length(trim(i.audio_preview_url)) > 0 THEN
        LEAST(
          30::numeric,
          GREATEST(
            5::numeric,
            COALESCE(i.preview_end_seconds, COALESCE(i.preview_start_seconds, 0) + 30)
              - COALESCE(i.preview_start_seconds, 0)
          )
        )
      ELSE
        LEAST(
          COALESCE(i.preview_start_seconds, 0) + 30,
          GREATEST(
            COALESCE(i.preview_end_seconds, COALESCE(i.preview_start_seconds, 0) + 30),
            COALESCE(i.preview_start_seconds, 0) + 5
          )
        )::numeric
    END AS preview_end_seconds
  FROM public.oculto_play_items i
  WHERE i.id = p_item_id
    AND COALESCE(i.is_published, true) = true
    AND COALESCE(i.is_draft, false) = false
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_preview_window(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';