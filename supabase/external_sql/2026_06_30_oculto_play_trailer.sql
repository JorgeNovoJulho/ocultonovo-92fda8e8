-- ============================================================
-- OCULTO PLAY — Trailer externo + listagem completa de Filmes
-- e Filmes +18.
--
-- A janela de trim (start/end) define o trecho a tocar (máx 90s).
-- Quando trailer_url == NULL mas trim definido, aplica o trim ao
-- próprio media_url/source_url.
--
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS trailer_url text,
  ADD COLUMN IF NOT EXISTS trailer_trim_start_seconds numeric,
  ADD COLUMN IF NOT EXISTS trailer_trim_end_seconds numeric,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS link_provider text,
  ADD COLUMN IF NOT EXISTS genre_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.oculto_play_items.trailer_url IS
  'URL pública de um arquivo de trailer (max 90s). Quando definido, é usado nas páginas públicas de compartilhamento em vez do arquivo/link completo.';
COMMENT ON COLUMN public.oculto_play_items.trailer_trim_start_seconds IS
  'Início (em segundos) da janela de playback do trailer. Aplica-se ao trailer_url quando definido; senão ao media_url/source_url.';
COMMENT ON COLUMN public.oculto_play_items.trailer_trim_end_seconds IS
  'Fim (em segundos) da janela de playback do trailer. Diferença (end-start) limitada a 90s.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'oculto_play_trailer_max_90s'
      AND conrelid = 'public.oculto_play_items'::regclass
  ) THEN
    ALTER TABLE public.oculto_play_items
      ADD CONSTRAINT oculto_play_trailer_max_90s
      CHECK (
        trailer_trim_start_seconds IS NULL
        OR trailer_trim_end_seconds IS NULL
        OR (
          trailer_trim_start_seconds >= 0
          AND trailer_trim_end_seconds > trailer_trim_start_seconds
          AND trailer_trim_end_seconds - trailer_trim_start_seconds <= 90
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_play_items_link_adult_published
  ON public.oculto_play_items (is_adult, published_at DESC)
  WHERE kind = 'link' AND is_published = true;

-- =================================================
-- Atualiza oculto_play_feed para devolver trailer_*
-- =================================================
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
  preview_start_seconds numeric, preview_end_seconds numeric,
  trim_start_seconds numeric, trim_end_seconds numeric,
  lyrics text, source_url text, link_provider text,
  is_adult boolean,
  trailer_url text,
  trailer_trim_start_seconds numeric,
  trailer_trim_end_seconds numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
    COALESCE(i.view_count, 0)::int,
    COALESCE(i.like_count, 0)::int,
    COALESCE(i.save_count, 0)::int,
    COALESCE(i.share_count, 0)::int,
    COALESCE(i.dislike_count, 0)::int AS dislike_count,
    COALESCE(i.comment_count, 0)::int AS comment_count,
    i.published_at, i.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i.id AND l.user_id = auth.uid()) AS liked_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i.id AND s.user_id = auth.uid()) AS saved_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_dislikes d WHERE d.item_id = i.id AND d.user_id = auth.uid()) AS disliked_by_me,
    COALESCE(i.genre_tags, '{}'::text[]) AS genre_tags,
    i.ai_tool,
    i.composer_name,
    i.preview_start_seconds,
    i.preview_end_seconds,
    i.trim_start_seconds,
    i.trim_end_seconds,
    i.lyrics,
    i.source_url,
    i.link_provider,
    COALESCE(i.is_adult, false) AS is_adult,
    i.trailer_url,
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
  WHERE COALESCE(i.is_published, true) = true
    AND COALESCE(i.is_draft, false) = false
    AND i.section = p_section
    AND (p_kind IS NULL OR i.kind = p_kind)
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (p_before IS NULL OR i.published_at < p_before)
  ORDER BY i.published_at DESC NULLS LAST, i.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_feed(
  public.oculto_play_section, public.oculto_play_kind, int, timestamptz
) TO authenticated;

-- =====================================================================
-- Atualiza oculto_play_guest_item para devolver trailer_url + janela.
-- A página pública prefere o trailer quando ele existir.
-- =====================================================================
DROP FUNCTION IF EXISTS public.oculto_play_guest_item(uuid);

CREATE OR REPLACE FUNCTION public.oculto_play_guest_item(
  p_item_id uuid
) RETURNS TABLE (
  id                          uuid,
  kind                        text,
  title                       text,
  caption                     text,
  thumb_url                   text,
  media_url                   text,
  audio_url                   text,
  source_url                  text,
  visibility                  text,
  duration_sec                int,
  view_count                  int,
  like_count                  int,
  share_count                 int,
  comment_count               int,
  published_at                timestamptz,
  author_id                   uuid,
  author_username             text,
  author_display_name         text,
  author_avatar_url           text,
  locked                      boolean,
  preview_start_seconds       numeric,
  preview_end_seconds         numeric,
  trailer_url                 text,
  trailer_trim_start_seconds  numeric,
  trailer_trim_end_seconds    numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows int := 0;
BEGIN
  IF p_item_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.kind::text,
    i.title,
    CASE
      WHEN i.caption IS NULL THEN NULL
      WHEN length(i.caption) > 400 THEN substring(i.caption from 1 for 397) || '…'
      ELSE i.caption
    END AS caption,
    i.thumb_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.media_url END AS media_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.audio_url END AS audio_url,
    CASE WHEN i.visibility::text IN ('vip','premium') THEN NULL ELSE i.source_url END AS source_url,
    i.visibility::text,
    i.duration_sec,
    COALESCE(i.view_count, 0)::int,
    COALESCE(i.like_count, 0)::int,
    COALESCE(i.share_count, 0)::int,
    COALESCE(i.comment_count, 0)::int,
    i.published_at,
    i.author_id,
    p.username,
    p.display_name,
    p.avatar_url,
    (i.visibility::text IN ('vip','premium')) AS locked,
    i.preview_start_seconds,
    i.preview_end_seconds,
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
  WHERE (i.id = p_item_id OR i.source_post_id = p_item_id)
    AND COALESCE(i.is_published, true) = true
    AND COALESCE(i.is_draft, false) = false
    AND (i.expires_at IS NULL OR i.expires_at > now())
  ORDER BY CASE WHEN i.id = p_item_id THEN 0 ELSE 1 END, i.published_at DESC NULLS LAST
  LIMIT 1;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RETURN;
  END IF;

  -- Fallback legado: posts antigos sem espelho em oculto_play_items.
  RETURN QUERY
  SELECT
    po.id,
    CASE
      WHEN COALESCE(po.media_type, '') ILIKE 'video%' OR COALESCE(po.media_url, '') ~* '\.(mp4|webm|mov|m4v)(\?|$)' THEN 'short_video'
      ELSE 'meme'
    END AS kind,
    NULL::text AS title,
    CASE
      WHEN po.content_text IS NULL THEN NULL
      WHEN length(po.content_text) > 400 THEN substring(po.content_text from 1 for 397) || '…'
      ELSE po.content_text
    END AS caption,
    COALESCE(po.thumbnail_url, po.preview_url) AS thumb_url,
    po.media_url,
    NULL::text AS audio_url,
    NULL::text AS source_url,
    'public'::text AS visibility,
    NULL::int AS duration_sec,
    0::int AS view_count,
    COALESCE(po.likes_count, 0)::int AS like_count,
    COALESCE(po.shares_count, 0)::int AS share_count,
    COALESCE(po.comments_count, 0)::int AS comment_count,
    COALESCE(po.created_at, now())::timestamptz AS published_at,
    po.author_id,
    p.username,
    p.display_name,
    p.avatar_url,
    false AS locked,
    NULL::numeric AS preview_start_seconds,
    NULL::numeric AS preview_end_seconds,
    NULL::text AS trailer_url,
    NULL::numeric AS trailer_trim_start_seconds,
    NULL::numeric AS trailer_trim_end_seconds
  FROM public.posts po
  LEFT JOIN LATERAL (
    SELECT pr.username, pr.display_name, pr.avatar_url
      FROM public.profiles pr
     WHERE pr.id = po.author_id OR pr.user_id = po.author_id OR pr.id = po.creator_id OR pr.user_id = po.creator_id
     ORDER BY CASE WHEN pr.id = po.author_id THEN 0 WHEN pr.id = po.creator_id THEN 1 ELSE 2 END
     LIMIT 1
  ) p ON true
  WHERE po.id = p_item_id
    AND COALESCE(po.is_hidden, false) = false
    AND COALESCE(po.privacy_level, 'public') = 'public'
    AND COALESCE(po.is_paid, false) = false
    AND COALESCE(po.is_locked, false) = false
    AND po.media_url IS NOT NULL
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_guest_item(uuid) TO anon, authenticated;

-- =====================================================================
-- Atualiza oculto_play_public_preview (usado pelo /api/og-play) para
-- devolver trailer_url + janela de trim. Como o retorno mudou, precisa
-- derrubar a função antes para evitar ERROR 42P13.
-- =====================================================================
DROP FUNCTION IF EXISTS public.oculto_play_public_preview(uuid);

CREATE OR REPLACE FUNCTION public.oculto_play_public_preview(
  p_item_id uuid
) RETURNS TABLE (
  id                          uuid,
  kind                        text,
  title                       text,
  caption                     text,
  thumb_url                   text,
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
