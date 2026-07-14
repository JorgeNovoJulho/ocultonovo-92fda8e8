-- ============================================================================
-- OCULTO PLAY — Correção resiliente do acesso público /play/p/:id
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--
-- Corrige o caso em que o link compartilhado chega com o ID do post de origem
-- em vez do ID real de public.oculto_play_items, causando "Conteúdo indisponível".
-- A RPC agora aceita:
--   1) oculto_play_items.id
--   2) oculto_play_items.source_post_id
--   3) posts.id público/free com mídia, como fallback legado
--
-- Mantém segurança: conteúdo Premium/VIP retorna locked=true sem media_url/audio_url.
-- ============================================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.oculto_play_guest_item(
  p_item_id uuid
) RETURNS TABLE (
  id                  uuid,
  kind                text,
  title               text,
  caption             text,
  thumb_url           text,
  media_url           text,
  audio_url           text,
  visibility          text,
  duration_sec        int,
  view_count          int,
  like_count          int,
  share_count         int,
  comment_count       int,
  published_at        timestamptz,
  author_id           uuid,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  locked              boolean
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
    (i.visibility::text IN ('vip','premium')) AS locked
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
    AND (i.expires_at IS NULL OR i.expires_at > now())
  ORDER BY CASE WHEN i.id = p_item_id THEN 0 ELSE 1 END, i.published_at DESC NULLS LAST
  LIMIT 1;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    RETURN;
  END IF;

  -- Fallback: alguns compartilhamentos antigos/legados usam o ID do post do feed,
  -- sem ainda existir uma linha espelhada em oculto_play_items.
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
    false AS locked
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

CREATE OR REPLACE FUNCTION public.oculto_play_guest_register_view(
  p_item_id uuid
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_count int;
  v_visibility text;
BEGIN
  IF p_item_id IS NULL THEN RETURN 0; END IF;

  SELECT i.id, i.visibility::text
    INTO v_item_id, v_visibility
    FROM public.oculto_play_items i
   WHERE (i.id = p_item_id OR i.source_post_id = p_item_id)
     AND COALESCE(i.is_published, true) = true
     AND (i.expires_at IS NULL OR i.expires_at > now())
   ORDER BY CASE WHEN i.id = p_item_id THEN 0 ELSE 1 END, i.published_at DESC NULLS LAST
   LIMIT 1;

  IF v_item_id IS NULL THEN RETURN 0; END IF;

  IF v_visibility IN ('vip','premium') THEN
    SELECT COALESCE(view_count, 0)::int
      INTO v_count
      FROM public.oculto_play_items
     WHERE id = v_item_id;
    RETURN COALESCE(v_count, 0);
  END IF;

  UPDATE public.oculto_play_items
     SET view_count = COALESCE(view_count, 0) + 1
   WHERE id = v_item_id
   RETURNING view_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_guest_register_view(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';