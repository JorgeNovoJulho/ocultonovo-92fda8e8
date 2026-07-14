-- ============================================================================
-- OCULTO PLAY — Etapa 11: Recomendação Personalizada ("Para Você")
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Adiciona 1 RPC SECURITY DEFINER.
-- ----------------------------------------------------------------------------
-- Lógica (explicável, sem caixa-preta):
--   Score por item =
--       + 4 * matches em TAGS afins (extraídas dos likes/saves/views recentes)
--       + 3 se o autor está entre os 30 mais interagidos pelo usuário
--       + 2 se o autor é seguido (oculto_followers)
--       + log10(view_count + 10) * 0.5    (popularidade leve)
--       + boost de recência (decai em 7 dias)
--   Exclui:
--       - itens do próprio usuário
--       - itens já curtidos / salvos / vistos recentemente
--       - itens não publicados ou auto-ocultos
--   Fallback: se score=0 pra todos, retorna trending (mais views nas últimas 72h).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_recommend(p_limit int DEFAULT 20)
RETURNS TABLE (
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
  reco_score          numeric,
  reco_reason         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int  := GREATEST(1, LEAST(p_limit, 50));
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  -- gate de acesso reaproveitado
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;

  RETURN QUERY
  WITH recent_signal AS (
    -- itens com que o usuário interagiu nos últimos 30d
    SELECT i.id, i.author_id, i.tags
      FROM public.oculto_play_likes l
      JOIN public.oculto_play_items i ON i.id = l.item_id
     WHERE l.user_id = v_uid AND l.created_at > now() - interval '30 days'
    UNION ALL
    SELECT i.id, i.author_id, i.tags
      FROM public.oculto_play_saves s
      JOIN public.oculto_play_items i ON i.id = s.item_id
     WHERE s.user_id = v_uid AND s.created_at > now() - interval '30 days'
    UNION ALL
    SELECT i.id, i.author_id, i.tags
      FROM public.oculto_play_views v
      JOIN public.oculto_play_items i ON i.id = v.item_id
     WHERE v.user_id = v_uid AND v.created_at > now() - interval '14 days'
  ),
  affinity_tags AS (
    SELECT unnest(coalesce(tags, ARRAY[]::text[])) AS tag, count(*) AS w
      FROM recent_signal
     GROUP BY 1
     ORDER BY w DESC
     LIMIT 25
  ),
  affinity_authors AS (
    SELECT author_id, count(*) AS w
      FROM recent_signal
     WHERE author_id IS NOT NULL AND author_id <> v_uid
     GROUP BY 1
     ORDER BY w DESC
     LIMIT 30
  ),
  followed AS (
    SELECT following_id AS author_id
      FROM public.oculto_followers
     WHERE follower_id = v_uid
  ),
  seen AS (
    SELECT item_id FROM public.oculto_play_likes WHERE user_id = v_uid
    UNION
    SELECT item_id FROM public.oculto_play_saves WHERE user_id = v_uid
    UNION
    SELECT item_id FROM public.oculto_play_views
     WHERE user_id = v_uid AND created_at > now() - interval '7 days'
  ),
  base AS (
    SELECT i.*,
      -- matches de tag
      coalesce((
        SELECT sum(at.w)::numeric
          FROM affinity_tags at
         WHERE at.tag = ANY(coalesce(i.tags, ARRAY[]::text[]))
      ), 0) AS tag_score,
      CASE WHEN EXISTS (SELECT 1 FROM affinity_authors aa WHERE aa.author_id = i.author_id) THEN 3 ELSE 0 END AS author_score,
      CASE WHEN EXISTS (SELECT 1 FROM followed f WHERE f.author_id = i.author_id) THEN 2 ELSE 0 END AS follow_score,
      (log(greatest(i.view_count, 0) + 10) * 0.5)::numeric AS pop_score,
      -- recência: 1.5 em ≤24h, ~0 em ≥7d
      GREATEST(0, 1.5 - (extract(epoch FROM (now() - i.published_at)) / 86400.0) * 0.2)::numeric AS fresh_score
    FROM public.oculto_play_items i
    WHERE i.is_published = true
      AND i.auto_hidden_at IS NULL
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND i.author_id <> v_uid
      AND NOT EXISTS (SELECT 1 FROM seen s WHERE s.item_id = i.id)
  ),
  scored AS (
    SELECT b.*,
      (b.tag_score * 4 + b.author_score + b.follow_score + b.pop_score + b.fresh_score) AS score,
      CASE
        WHEN b.tag_score > 0 AND b.follow_score > 0 THEN 'Combina com você e quem você segue'
        WHEN b.tag_score > 0                        THEN 'Combina com seus interesses'
        WHEN b.follow_score > 0                     THEN 'De alguém que você segue'
        WHEN b.author_score > 0                     THEN 'Você já interagiu com este criador'
        ELSE                                             'Em alta agora'
      END AS reason
    FROM base b
  ),
  ranked AS (
    SELECT * FROM scored
     WHERE score > 0
     ORDER BY score DESC, published_at DESC
     LIMIT v_lim
  ),
  fallback AS (
    -- se nada personalizado, devolve trending recente
    SELECT b.*, (b.pop_score + b.fresh_score) AS score, 'Em alta agora'::text AS reason
      FROM base b
     WHERE NOT EXISTS (SELECT 1 FROM ranked)
     ORDER BY (b.pop_score + b.fresh_score) DESC, b.published_at DESC
     LIMIT v_lim
  ),
  final AS (
    SELECT * FROM ranked
    UNION ALL
    SELECT * FROM fallback
  )
  SELECT
    f.id, f.author_id, f.kind::text, f.section::text, f.visibility::text,
    f.title, f.caption, f.media_url, f.thumb_url, f.audio_url, f.duration_sec,
    f.tags, f.view_count, f.like_count, f.save_count, f.share_count,
    f.published_at, f.expires_at,
    p.username, p.display_name, p.avatar_url,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = f.id AND l.user_id = v_uid),
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = f.id AND s.user_id = v_uid),
    round(f.score::numeric, 2),
    f.reason
  FROM final f
  LEFT JOIN public.profiles p ON p.id = f.author_id
  ORDER BY f.score DESC, f.published_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_recommend(int) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIM — Etapa 11
-- ============================================================================
