-- ============================================================
-- Etapa 53.1 — "Em Alta nas Últimas 24h" ordenado por VIEWS REAIS
-- nas últimas 24h (tabela oculto_play_views.last_seen_at).
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE OR REPLACE FUNCTION public.oculto_play_trending_24h()
RETURNS TABLE (
  id uuid,
  kind text,
  title text,
  caption text,
  thumb_url text,
  media_url text,
  audio_url text,
  visibility text,
  view_count integer,
  like_count integer,
  published_at timestamptz,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  trend_score numeric,
  recent_reactions integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH views24 AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_views
     WHERE last_seen_at >= now() - interval '24 hours'
     GROUP BY item_id
  ),
  reactions24 AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_timeline_reactions
     WHERE created_at >= now() - interval '24 hours'
     GROUP BY item_id
  )
  SELECT
    i.id,
    i.kind,
    i.title,
    i.caption,
    i.thumb_url,
    i.media_url,
    i.audio_url,
    COALESCE(i.visibility, 'public') AS visibility,
    COALESCE(i.view_count, 0) AS view_count,
    COALESCE(i.like_count, 0) AS like_count,
    i.published_at,
    i.author_id AS author_id,
    p.username  AS author_username,
    p.display_name AS author_display_name,
    p.avatar_url   AS author_avatar_url,
    COALESCE(v.qty, 0)::numeric AS trend_score,
    COALESCE(r.qty, 0) AS recent_reactions
  FROM public.oculto_play_items i
  LEFT JOIN views24    v ON v.item_id = i.id
  LEFT JOIN reactions24 r ON r.item_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.published_at IS NOT NULL
    AND COALESCE(i.visibility, 'public') IN ('public','premium','vip')
  ORDER BY COALESCE(v.qty, 0) DESC,
           COALESCE(r.qty, 0) DESC,
           i.published_at DESC
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_trending_24h() TO anon, authenticated;
