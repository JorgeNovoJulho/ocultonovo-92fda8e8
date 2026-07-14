-- ============================================================
-- OCULTO PLAY — Realtime + Em Alta 24h com Áudios, Vídeos, Filmes e Filmes +18
-- Inclui publicação realtime das tabelas usadas e campos para molduras por seção.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  BEGIN
    EXECUTE 'ALTER TABLE public.oculto_play_items REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE public.oculto_play_views REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE public.oculto_play_likes REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_play_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_play_views'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_views';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_play_likes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_likes';
  END IF;
END $$;

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
  recent_reactions integer,
  source_url text,
  link_provider text,
  is_adult boolean
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
    i.kind::text AS kind,
    i.title,
    i.caption,
    i.thumb_url,
    i.media_url,
    i.audio_url,
    COALESCE(i.visibility, 'public')::text AS visibility,
    COALESCE(i.view_count, 0)::int AS view_count,
    COALESCE(i.like_count, 0)::int AS like_count,
    i.published_at,
    i.author_id,
    p.username AS author_username,
    p.display_name AS author_display_name,
    p.avatar_url AS author_avatar_url,
    (
      COALESCE(v.qty, 0) * 3.0
      + COALESCE(l.qty, 0) * 6.0
      + COALESCE(i.view_count, 0) * 0.25
      + COALESCE(i.like_count, 0) * 0.75
    )::numeric AS trend_score,
    COALESCE(v.qty, 0)::int AS views_24h,
    COALESCE(l.qty, 0)::int AS likes_24h,
    COALESCE(l.qty, 0)::int AS recent_reactions,
    i.source_url,
    i.link_provider,
    COALESCE(i.is_adult, false) AS is_adult
  FROM public.oculto_play_items i
  LEFT JOIN views24 v ON v.item_id = i.id
  LEFT JOIN likes24 l ON l.item_id = i.id
  LEFT JOIN LATERAL (
    SELECT pr.username, pr.display_name, pr.avatar_url
      FROM public.profiles pr
     WHERE pr.id = i.author_id OR pr.user_id = i.author_id
     ORDER BY CASE WHEN pr.id = i.author_id THEN 0 ELSE 1 END
     LIMIT 1
  ) p ON true
  WHERE i.published_at IS NOT NULL
    AND COALESCE(i.is_published, true) = true
    AND COALESCE(i.is_draft, false) = false
    AND COALESCE(i.visibility, 'public') IN ('public','premium','vip')
    AND COALESCE(i.kind::text, '') IN ('audio','short_video','vip_teaser','link')
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (
      COALESCE(v.qty, 0) > 0
      OR COALESCE(l.qty, 0) > 0
      OR COALESCE(i.view_count, 0) > 0
      OR i.published_at >= now() - interval '24 hours'
    )
  ORDER BY trend_score DESC,
           COALESCE(i.view_count, 0) DESC,
           COALESCE(i.like_count, 0) DESC,
           i.published_at DESC NULLS LAST
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_trending_24h() TO authenticated, anon;
NOTIFY pgrst, 'reload schema';