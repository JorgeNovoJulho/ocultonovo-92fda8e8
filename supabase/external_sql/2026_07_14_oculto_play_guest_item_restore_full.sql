-- =========================================================
-- Restaura oculto_play_guest_item com todos os campos usados
-- pelo frontend (avatar, display name, published_at, counts,
-- source_url, trailer_url, genre_tags, is_adult).
-- Idempotente.
-- =========================================================

DROP FUNCTION IF EXISTS public.oculto_play_guest_item(uuid);

CREATE OR REPLACE FUNCTION public.oculto_play_guest_item(p_item_id uuid)
RETURNS TABLE (
  id                     uuid,
  kind                   text,
  title                  text,
  caption                text,
  thumb_url              text,
  media_url              text,
  audio_url              text,
  source_url             text,
  trailer_url            text,
  visibility             text,
  duration_sec           integer,
  view_count             integer,
  like_count             integer,
  share_count            integer,
  comment_count          integer,
  published_at           timestamptz,
  expires_at             timestamptz,
  author_id              uuid,
  author_username        text,
  author_display_name    text,
  author_avatar_url      text,
  locked                 boolean,
  is_adult               boolean,
  genre_tags             text[],
  preview_start_seconds  numeric,
  preview_end_seconds    numeric,
  trailer_trim_start_seconds numeric,
  trailer_trim_end_seconds   numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.kind::text,
    i.title,
    i.caption,
    i.thumb_url,
    i.media_url,
    i.audio_url,
    NULLIF(i.source_url, '')::text                          AS source_url,
    NULLIF(i.trailer_url, '')::text                         AS trailer_url,
    COALESCE(i.visibility::text, 'public')                  AS visibility,
    COALESCE(i.duration_sec, 0)                             AS duration_sec,
    COALESCE(i.view_count, 0)                               AS view_count,
    COALESCE(i.like_count, 0)                               AS like_count,
    COALESCE(i.share_count, 0)                              AS share_count,
    COALESCE(i.comment_count, 0)                            AS comment_count,
    COALESCE(i.published_at, i.created_at)                  AS published_at,
    i.expires_at,
    i.author_id,
    pr.username                                             AS author_username,
    COALESCE(pr.display_name, pr.username)                  AS author_display_name,
    pr.avatar_url                                           AS author_avatar_url,
    false                                                   AS locked,
    COALESCE(i.is_adult, false)                             AS is_adult,
    COALESCE(i.genre_tags, ARRAY[]::text[])                 AS genre_tags,
    i.preview_start_seconds::numeric                        AS preview_start_seconds,
    i.preview_end_seconds::numeric                          AS preview_end_seconds,
    i.trailer_trim_start_seconds::numeric                   AS trailer_trim_start_seconds,
    i.trailer_trim_end_seconds::numeric                     AS trailer_trim_end_seconds
  FROM public.oculto_play_items i
  LEFT JOIN public.profiles pr
    ON pr.id = i.author_id OR pr.user_id = i.author_id
  WHERE i.id = p_item_id
    AND COALESCE(i.visibility::text, 'public') = 'public'
    AND (i.expires_at IS NULL OR i.expires_at > now())
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.oculto_play_guest_item(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oculto_play_guest_item(uuid) TO anon, authenticated, service_role;
