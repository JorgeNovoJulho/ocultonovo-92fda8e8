-- ============================================================
-- Etapa 55 — Top por Kind (Memes / Áudio dedicados)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE OR REPLACE FUNCTION public.oculto_play_top_by_kind(
  p_kind text,
  p_days int DEFAULT 7
)
RETURNS TABLE (
  id uuid, kind text, title text, caption text,
  thumb_url text, media_url text, audio_url text,
  visibility text, view_count integer, like_count integer,
  published_at timestamptz,
  author_id uuid, author_username text, author_display_name text, author_avatar_url text,
  recent_reactions integer, score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recent AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_timeline_reactions
     WHERE created_at >= now() - (p_days || ' days')::interval
     GROUP BY item_id
  )
  SELECT
    i.id, i.kind::text, i.title, i.caption, i.thumb_url, i.media_url, i.audio_url,
    COALESCE(i.visibility::text,'public'),
    COALESCE(i.view_count,0), COALESCE(i.like_count,0),
    i.published_at,
    i.author_id, p.username, p.display_name, p.avatar_url,
    COALESCE(r.qty,0),
    (COALESCE(r.qty,0) * 3.0 + ln(GREATEST(COALESCE(i.view_count,0),1)))::numeric(10,2) AS score
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
