-- ============================================================
-- Canais Play · FASE 1b — congelar itens, itens do canal, feed com canal,
-- faixa de canais com canais novos e tempo real.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO
-- (depois de 2026_10_14_play_canais_fase1.sql).
-- ============================================================

-- ---------- 1. Congelar ----------
-- Congelado = some para todos (is_published = false) e continua na lista do
-- próprio canal só para o dono, até descongelar.
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS frozen_at timestamptz;

CREATE OR REPLACE FUNCTION public.play_item_set_frozen(p_item_id uuid, p_frozen boolean)
RETURNS TABLE (id uuid, is_frozen boolean, is_published boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_ok  boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = 'P0001'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_play_items i
    LEFT JOIN public.profiles p ON p.id = i.author_id
    WHERE i.id = p_item_id
      AND (p.user_id = v_uid OR i.author_id = v_uid OR public.is_admin_master(v_uid))
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'Só quem publicou pode congelar este conteúdo.' USING ERRCODE = 'P0001'; END IF;

  RETURN QUERY
  UPDATE public.oculto_play_items i SET
    is_frozen    = p_frozen,
    frozen_at    = CASE WHEN p_frozen THEN now() ELSE NULL END,
    is_published = NOT p_frozen,
    updated_at   = now()
  WHERE i.id = p_item_id
    AND COALESCE(i.is_draft, false) = false
  RETURNING i.id, i.is_frozen, i.is_published;
END $$;

REVOKE ALL ON FUNCTION public.play_item_set_frozen(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_item_set_frozen(uuid, boolean) TO authenticated;

-- ---------- 2. Itens de um canal (dono também vê os congelados) ----------
-- p_tab: 'home' | 'shorts' | 'links' | 'memes' | 'links_adult' | 'audio'
DROP FUNCTION IF EXISTS public.play_channel_items(uuid, text, integer);
CREATE OR REPLACE FUNCTION public.play_channel_items(p_channel_id uuid, p_tab text DEFAULT 'home', p_limit integer DEFAULT 120)
RETURNS SETOF public.oculto_play_items
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ch AS (
    SELECT c.*, (c.owner_id = auth.uid() OR public.is_admin_master(auth.uid())) AS can_manage
    FROM public.oculto_play_channels c
    WHERE c.id = p_channel_id AND auth.uid() IS NOT NULL
      AND (c.status = 'active' OR c.owner_id = auth.uid() OR public.is_admin_master(auth.uid()))
  )
  SELECT i.*
  FROM public.oculto_play_items i
  JOIN ch ON ch.id = i.channel_id
  WHERE (i.expires_at IS NULL OR i.expires_at > now())
    AND COALESCE(i.is_draft, false) = false
    AND (i.is_published = true OR (ch.can_manage AND COALESCE(i.is_frozen, false)))
    AND (
         (p_tab = 'home'        AND NOT COALESCE(i.is_adult, false))
      OR (p_tab = 'shorts'      AND i.kind::text IN ('short_video','vip_teaser') AND NOT COALESCE(i.is_adult, false))
      OR (p_tab = 'links'       AND i.kind::text = 'link' AND NOT COALESCE(i.is_adult, false))
      OR (p_tab = 'memes'       AND i.kind::text = 'meme' AND NOT COALESCE(i.is_adult, false))
      OR (p_tab = 'audio'       AND i.kind::text = 'audio')
      OR (p_tab = 'links_adult' AND COALESCE(i.is_adult, false)
          AND (public._play_is_verified(auth.uid()) OR public.is_admin_master(auth.uid())))
    )
  ORDER BY COALESCE(i.is_frozen, false) DESC, i.published_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 120), 1), 300);
$$;

REVOKE ALL ON FUNCTION public.play_channel_items(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_channel_items(uuid, text, integer) TO authenticated;

-- ---------- 3. Feed do Play com dados do canal (sem duplicar itens) ----------
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
  channel_id uuid, channel_name text, channel_slug text, channel_avatar_url text,
  content_origin text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    p.username::text, p.display_name::text, p.avatar_url::text,
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
    c.id, c.name, c.slug, COALESCE(c.avatar_url, p.avatar_url)::text,
    i.content_origin
  FROM public.oculto_play_items i
  LEFT JOIN LATERAL (
    SELECT pp.username, pp.display_name, pp.avatar_url
    FROM public.profiles pp
    WHERE pp.id = i.author_id OR pp.user_id = i.author_id
    ORDER BY (pp.id = i.author_id) DESC
    LIMIT 1
  ) p ON true
  LEFT JOIN public.oculto_play_channels c ON c.id = i.channel_id AND c.status = 'active'
  WHERE i.is_published = true
    AND i.section = p_section
    AND (p_kind IS NULL OR i.kind = p_kind)
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (p_before IS NULL OR i.published_at < p_before)
    AND (i.channel_id IS NULL OR c.id IS NOT NULL)   -- canal suspenso some do feed
  ORDER BY i.published_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_feed(
  public.oculto_play_section, public.oculto_play_kind, int, timestamptz
) TO authenticated;

-- ---------- 4. Faixa "Canais": inclui canais novos (ainda sem envios) ----------
DROP FUNCTION IF EXISTS public.play_channels_strip(text, integer);
CREATE OR REPLACE FUNCTION public.play_channels_strip(p_section text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, slug text, name text, kind text, avatar_url text, is_official boolean,
  item_count integer, last_published_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  agg AS (
    SELECT i.channel_id, count(*)::int AS n, max(i.published_at) AS last_at
    FROM public.oculto_play_items i
    WHERE i.channel_id IS NOT NULL AND i.is_published = true
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (
        p_section IS NULL
        OR (p_section = 'shorts'      AND i.kind::text IN ('short_video','vip_teaser') AND NOT COALESCE(i.is_adult, false))
        OR (p_section = 'links'       AND i.kind::text = 'link' AND NOT COALESCE(i.is_adult, false))
        OR (p_section = 'links_adult' AND i.kind::text = 'link' AND COALESCE(i.is_adult, false))
        OR (p_section = 'memes'       AND i.kind::text = 'meme')
        OR (p_section = 'audio'       AND i.kind::text = 'audio')
      )
    GROUP BY i.channel_id
  )
  SELECT c.id, c.slug, c.name, c.kind,
         COALESCE(c.avatar_url, pr.avatar_url)::text,
         c.is_official, COALESCE(a.n, 0), COALESCE(a.last_at, c.created_at)
  FROM public.oculto_play_channels c
  LEFT JOIN agg a ON a.channel_id = c.id
  LEFT JOIN LATERAL (
    SELECT p.avatar_url FROM public.profiles p
    WHERE p.id = c.profile_id OR p.user_id = c.owner_id
    ORDER BY (p.id = c.profile_id) DESC LIMIT 1
  ) pr ON true
  CROSS JOIN me
  WHERE me.uid IS NOT NULL
    AND c.status = 'active'
    -- +18: só canais com conteúdo +18 e só para verificados.
    AND (
      CASE
        WHEN p_section = 'links_adult' THEN a.n IS NOT NULL
             AND (public._play_is_verified(me.uid) OR public.is_admin_master(me.uid))
        WHEN p_section = 'audio' THEN c.kind = 'audio'
        WHEN p_section IN ('shorts','links','memes') THEN c.kind = 'video'
        ELSE true
      END
    )
  ORDER BY (a.n IS NOT NULL) DESC, COALESCE(a.last_at, c.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 60);
$$;

REVOKE ALL ON FUNCTION public.play_channels_strip(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_channels_strip(text, integer) TO authenticated;

-- ---------- 5. Tempo real dos canais ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'oculto_play_channels'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_channels;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
