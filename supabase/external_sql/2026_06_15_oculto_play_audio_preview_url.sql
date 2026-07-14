-- ============================================================
-- OCULTO PLAY — áudio de preview dedicado e leve
-- Rodar no SQL Editor do Supabase EXTERNO.
-- Idempotente.
-- ============================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS audio_preview_url text;

DROP FUNCTION IF EXISTS public.oculto_play_feed(public.oculto_play_section, public.oculto_play_kind, int, timestamptz);

CREATE OR REPLACE FUNCTION public.oculto_play_feed(
  p_section public.oculto_play_section DEFAULT 'normal',
  p_kind    public.oculto_play_kind DEFAULT NULL,
  p_limit   int DEFAULT 20,
  p_before  timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid, author_id uuid, kind public.oculto_play_kind,
  section public.oculto_play_section, visibility public.oculto_play_visibility,
  title text, caption text, media_url text, thumb_url text, audio_url text,
  audio_preview_url text,
  duration_sec int, tags text[],
  view_count int, like_count int, save_count int, share_count int,
  dislike_count int, comment_count int,
  published_at timestamptz, expires_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  liked_by_me boolean, saved_by_me boolean, disliked_by_me boolean,
  genre_tags text[], ai_tool text, composer_name text,
  preview_start_seconds numeric, preview_end_seconds numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.author_id, i.kind, i.section, i.visibility,
    i.title, i.caption, i.media_url, i.thumb_url, i.audio_url,
    i.audio_preview_url,
    i.duration_sec,
    COALESCE(NULLIF(i.tags, '{}'::text[]), i.genre_tags, '{}'::text[]) AS tags,
    i.view_count, i.like_count, i.save_count, i.share_count,
    COALESCE(i.dislike_count, 0) AS dislike_count,
    COALESCE(i.comment_count, 0) AS comment_count,
    i.published_at, i.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i.id AND l.user_id = auth.uid()) AS liked_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i.id AND s.user_id = auth.uid()) AS saved_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_dislikes d WHERE d.item_id = i.id AND d.user_id = auth.uid()) AS disliked_by_me,
    COALESCE(i.genre_tags, '{}'::text[]) AS genre_tags,
    i.ai_tool,
    i.composer_name,
    i.preview_start_seconds,
    i.preview_end_seconds
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles p
    ON p.id = i.author_id
    OR p.user_id = i.author_id
  WHERE i.is_published = true
    AND i.section = p_section
    AND (p_kind IS NULL OR i.kind = p_kind)
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (p_before IS NULL OR i.published_at < p_before)
  ORDER BY i.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_feed(
  public.oculto_play_section, public.oculto_play_kind, int, timestamptz
) TO authenticated;

DROP FUNCTION IF EXISTS public.oculto_play_top_by_kind(text, int);

CREATE OR REPLACE FUNCTION public.oculto_play_top_by_kind(
  p_kind text,
  p_days int DEFAULT 7
)
RETURNS TABLE (
  id uuid, kind text, title text, caption text,
  thumb_url text, media_url text, audio_url text, audio_preview_url text,
  visibility text, view_count integer, like_count integer,
  published_at timestamptz,
  author_id uuid, author_username text, author_display_name text, author_avatar_url text,
  recent_reactions integer, score numeric,
  preview_start_seconds numeric, preview_end_seconds numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recent AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_timeline_reactions
     WHERE created_at >= now() - (p_days || ' days')::interval
     GROUP BY item_id
  )
  SELECT
    i.id, i.kind::text, i.title, i.caption, i.thumb_url, i.media_url, i.audio_url, i.audio_preview_url,
    COALESCE(i.visibility::text,'public'),
    COALESCE(i.view_count,0), COALESCE(i.like_count,0),
    i.published_at,
    i.author_id, p.username, p.display_name, p.avatar_url,
    COALESCE(r.qty,0),
    (COALESCE(r.qty,0) * 3.0 + ln(GREATEST(COALESCE(i.view_count,0),1)))::numeric(10,2) AS score,
    i.preview_start_seconds, i.preview_end_seconds
  FROM public.oculto_play_items i
  LEFT JOIN recent r ON r.item_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE i.kind::text = p_kind
    AND i.published_at IS NOT NULL
    AND i.published_at >= now() - (p_days || ' days')::interval
    AND COALESCE(i.visibility,'public') IN ('public','premium','vip')
  ORDER BY score DESC, i.published_at DESC
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_top_by_kind(text, int) TO anon, authenticated;