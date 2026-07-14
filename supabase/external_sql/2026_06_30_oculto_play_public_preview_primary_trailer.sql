-- ============================================================
-- OCULTO PLAY — Preview público priorizando recorte da mídia principal
-- Rodar no SQL Editor do Supabase EXTERNO.
--
-- Objetivo:
-- - Expor media_url e source_url na RPC usada pelo /api/og-play.
-- - Permitir que /play/p/:id e previews externos usem o recorte salvo
--   trailer_trim_start_seconds/trailer_trim_end_seconds sobre a mídia
--   principal quando existir.
-- - Manter trailer_url apenas como fallback de trailer pronto, quando
--   não houver janela de recorte da mídia principal.
-- ============================================================

DROP FUNCTION IF EXISTS public.oculto_play_public_preview(uuid);

CREATE OR REPLACE FUNCTION public.oculto_play_public_preview(
  p_item_id uuid
) RETURNS TABLE (
  id                          uuid,
  kind                        text,
  title                       text,
  caption                     text,
  thumb_url                   text,
  media_url                   text,
  source_url                  text,
  visibility                  text,
  duration_sec                int,
  view_count                  int,
  like_count                  int,
  published_at                timestamptz,
  author_username             text,
  author_display_name         text,
  author_avatar_url           text,
  trailer_url                 text,
  trailer_trim_start_seconds  numeric,
  trailer_trim_end_seconds    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.kind::text,
    i.title,
    CASE
      WHEN i.caption IS NULL THEN NULL
      WHEN length(i.caption) > 200 THEN substring(i.caption from 1 for 197) || '…'
      ELSE i.caption
    END AS caption,
    i.thumb_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.media_url END AS media_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.source_url END AS source_url,
    i.visibility::text,
    i.duration_sec,
    COALESCE(i.view_count, 0)::int,
    COALESCE(i.like_count, 0)::int,
    i.published_at,
    p.username,
    p.display_name,
    p.avatar_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.trailer_url END AS trailer_url,
    i.trailer_trim_start_seconds,
    i.trailer_trim_end_seconds
  FROM public.oculto_play_items i
  LEFT JOIN LATERAL (
    SELECT pr.username, pr.display_name, pr.avatar_url
      FROM public.profiles pr
     WHERE pr.id = i.author_id OR pr.user_id = i.author_id
     ORDER BY CASE WHEN pr.id = i.author_id THEN 0 ELSE 1 END
     LIMIT 1
  ) p ON true
  WHERE i.id = p_item_id
    AND COALESCE(i.is_published, true) = true
    AND COALESCE(i.is_draft, false) = false
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_public_preview(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';