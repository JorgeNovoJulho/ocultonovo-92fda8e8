-- ============================================================================
-- OCULTO PLAY — Etapa 35: Fila "Up Next" (autoplay sequencial)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Isolado em oculto_play_*.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_up_next(
  p_seed_item_id uuid,
  p_exclude      uuid[] DEFAULT ARRAY[]::uuid[],
  p_limit        int     DEFAULT 10
) RETURNS TABLE (
  id                  uuid,
  author_id           uuid,
  kind                text,
  section             text,
  visibility          text,
  title               text,
  caption             text,
  media_url           text,
  thumb_url           text,
  audio_url           text,
  duration_sec        int,
  tags                text[],
  view_count          int,
  like_count          int,
  save_count          int,
  share_count         int,
  published_at        timestamptz,
  expires_at          timestamptz,
  author_username     text,
  author_display_name text,
  author_avatar_url   text,
  liked_by_me         boolean,
  saved_by_me         boolean,
  up_next_score       numeric,
  up_next_reason      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int  := GREATEST(1, LEAST(p_limit, 25));
  v_seed_author uuid;
  v_seed_kind   text;
  v_seed_tags   text[];
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;

  SELECT i.author_id, i.kind, COALESCE(i.tags, ARRAY[]::text[])
    INTO v_seed_author, v_seed_kind, v_seed_tags
  FROM public.oculto_play_items i
  WHERE i.id = p_seed_item_id;

  IF v_seed_author IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT i.*,
           CASE WHEN i.author_id = v_seed_author THEN 1.0 ELSE 0.0 END AS s_author,
           CASE WHEN i.kind      = v_seed_kind   THEN 0.4 ELSE 0.0 END AS s_kind,
           (
             SELECT COUNT(*)::numeric
               FROM unnest(COALESCE(i.tags, ARRAY[]::text[])) t
              WHERE t = ANY(v_seed_tags)
           ) * 0.25 AS s_tags,
           CASE
             WHEN i.published_at > now() - interval '3 days'  THEN 0.6
             WHEN i.published_at > now() - interval '14 days' THEN 0.3
             ELSE 0.1
           END AS s_fresh,
           LEAST(1.0, (COALESCE(i.like_count,0) + COALESCE(i.save_count,0) * 2) / 50.0) AS s_pop
    FROM public.oculto_play_items i
    WHERE i.id <> p_seed_item_id
      AND (p_exclude IS NULL OR NOT (i.id = ANY(p_exclude)))
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND public.can_view_oculto_play_item(i.id)
  ),
  scored AS (
    SELECT b.*,
           (b.s_author + b.s_kind + b.s_tags + b.s_fresh + b.s_pop) AS score,
           CASE
             WHEN b.s_author > 0 THEN 'Do mesmo criador'
             WHEN b.s_tags   > 0 THEN 'Tags em comum'
             WHEN b.s_kind   > 0 THEN 'Mesmo formato'
             ELSE 'Em alta agora'
           END AS reason
    FROM base b
  )
  SELECT
    s.id, s.author_id, s.kind, s.section, s.visibility, s.title, s.caption,
    s.media_url, s.thumb_url, s.audio_url, s.duration_sec, s.tags,
    s.view_count, s.like_count, s.save_count, s.share_count,
    s.published_at, s.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = s.id AND l.user_id = v_uid) AS liked_by_me,
    EXISTS (SELECT 1 FROM public.oculto_play_saves sv WHERE sv.item_id = s.id AND sv.user_id = v_uid) AS saved_by_me,
    s.score AS up_next_score,
    s.reason AS up_next_reason
  FROM scored s
  LEFT JOIN public.profiles p ON p.id = s.author_id
  ORDER BY s.score DESC, s.published_at DESC
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_up_next(uuid, uuid[], int) TO authenticated;

-- Fallback: se can_view_oculto_play_item não existir, recria como permissiva
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='can_view_oculto_play_item'
  ) THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.can_view_oculto_play_item(p_id uuid)
      RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $b$
        SELECT public.can_access_oculto_play();
      $b$;
    $f$;
    GRANT EXECUTE ON FUNCTION public.can_view_oculto_play_item(uuid) TO authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
