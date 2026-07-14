-- ============================================================
-- OCULTO PLAY — Estende oculto_play_feed() para devolver
-- metadados de áudio (genre_tags, ai_tool, composer_name),
-- dislike/comment counts + disliked_by_me, e habilita update do autor.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

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
  duration_sec int, tags text[],
  view_count int, like_count int, save_count int, share_count int,
  dislike_count int, comment_count int,
  published_at timestamptz, expires_at timestamptz,
  author_username text, author_display_name text, author_avatar_url text,
  liked_by_me boolean, saved_by_me boolean, disliked_by_me boolean,
  genre_tags text[], ai_tool text, composer_name text
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
    i.composer_name
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

-- ============================================================
-- RPC: oculto_play_update_item — edição pelo autor (3-dot menu)
-- ============================================================
CREATE OR REPLACE FUNCTION public.oculto_play_update_item(
  p_item_id       uuid,
  p_title         text DEFAULT NULL,
  p_caption       text DEFAULT NULL,
  p_composer_name text DEFAULT NULL,
  p_ai_tool       text DEFAULT NULL,
  p_genre_tags    text[] DEFAULT NULL
)
RETURNS public.oculto_play_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_play_items;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.oculto_play_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.author_id <> v_uid
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.user_id = v_uid AND p.id = v_row.author_id
     )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.oculto_play_items
     SET title         = COALESCE(p_title,         title),
         caption       = COALESCE(p_caption,       caption),
         composer_name = COALESCE(p_composer_name, composer_name),
         ai_tool       = COALESCE(p_ai_tool,       ai_tool),
         genre_tags    = COALESCE(p_genre_tags,    genre_tags),
         updated_at    = now()
   WHERE id = p_item_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_update_item(uuid, text, text, text, text, text[])
  TO authenticated, service_role;
