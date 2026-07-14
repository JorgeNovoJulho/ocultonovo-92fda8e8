-- ============================================================
-- OCULTO PLAY — Preview snippet de áudio (até 30s)
-- Adiciona colunas preview_start_seconds / preview_end_seconds
-- e estende oculto_play_feed() para devolvê-las.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- 1) Colunas no item
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS preview_start_seconds numeric(8,2),
  ADD COLUMN IF NOT EXISTS preview_end_seconds   numeric(8,2);

-- Limite "soft" de 30s no preview (não falha em itens antigos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'oculto_play_items_preview_max_30s'
  ) THEN
    ALTER TABLE public.oculto_play_items
      ADD CONSTRAINT oculto_play_items_preview_max_30s
      CHECK (
        preview_start_seconds IS NULL
        OR preview_end_seconds IS NULL
        OR (
          preview_end_seconds > preview_start_seconds
          AND (preview_end_seconds - preview_start_seconds) <= 30.5
        )
      ) NOT VALID;
  END IF;
END $$;

-- 2) Atualiza RPC oculto_play_feed para expor os campos de preview
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
