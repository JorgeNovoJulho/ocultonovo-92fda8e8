-- ============================================================================
-- OCULTO PLAY — Fix RPC oculto_play_public_preview
-- Bug: coluna `kind` é ENUM (oculto_play_kind), mas RPC declara `text`.
-- Erro retornado: "Returned type oculto_play_kind does not match expected type text"
-- Correção: cast explícito i.kind::text e i.visibility::text (também é enum).
-- 100% idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_public_preview(
  p_item_id uuid
) RETURNS TABLE (
  id                  uuid,
  kind                text,
  title               text,
  caption             text,
  thumb_url           text,
  visibility          text,
  duration_sec        int,
  view_count          int,
  like_count          int,
  published_at        timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    i.visibility::text,
    i.duration_sec,
    COALESCE(i.view_count, 0),
    COALESCE(i.like_count, 0),
    i.published_at,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.id = p_item_id
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_public_preview(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
