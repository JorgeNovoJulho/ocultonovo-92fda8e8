-- ============================================================
-- "Em Alta nas Últimas 24h" — ORDENAÇÃO por TOTAL de visualizações
-- 1º critério: view_count (total) DESC
-- 2º critério (desempate): like_count (total) DESC
-- 3º critério: published_at DESC
-- Mantém views_24h e likes_24h como informativos (não influenciam ordem).
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

DROP FUNCTION IF EXISTS public.oculto_play_trending_24h();

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
  views_24h integer,
  likes_24h integer,
  recent_reactions integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH views24 AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_views
     WHERE last_seen_at >= now() - interval '24 hours'
     GROUP BY item_id
  ),
  likes24 AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_likes
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
    i.author_id,
    p.username      AS author_username,
    p.display_name  AS author_display_name,
    p.avatar_url    AS author_avatar_url,
    (COALESCE(i.view_count,0) * 1.0 + COALESCE(i.like_count,0) * 0.001)::numeric AS trend_score,
    COALESCE(v.qty,0) AS views_24h,
    COALESCE(l.qty,0) AS likes_24h,
    COALESCE(l.qty,0) AS recent_reactions
  FROM public.oculto_play_items i
  LEFT JOIN views24 v ON v.item_id = i.id
  LEFT JOIN likes24 l ON l.item_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.published_at IS NOT NULL
    AND COALESCE(i.visibility, 'public') IN ('public','premium','vip')
    AND COALESCE(i.view_count, 0) > 0
  ORDER BY COALESCE(i.view_count,0) DESC,
           COALESCE(i.like_count,0) DESC,
           i.published_at DESC NULLS LAST
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_trending_24h() TO authenticated, anon;
NOTIFY pgrst, 'reload schema';
