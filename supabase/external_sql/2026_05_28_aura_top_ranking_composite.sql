-- =====================================================================
-- 2026-05-28 — Top Auras: score composto + colunas para a listview
-- Inclui no cálculo da posição:
--   • aura_xp                 (peso 1)
--   • voice_bio_score (líquido)  ×5
--   • aura_level              ×100
--   • achievements_count (quests reivindicadas)  ×20
--   • visits_received (visitantes únicos do perfil)  ×2
-- Retorna novas colunas para a UI:
--   • achievements_count
--   • visits_received
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- Drop versões anteriores (assinaturas podem variar) para permitir mudança de RETURNS TABLE
DROP FUNCTION IF EXISTS public.aura_top_ranking(integer, integer);
DROP FUNCTION IF EXISTS public.aura_top_ranking(int, int);
DROP FUNCTION IF EXISTS public.aura_top_ranking();
DROP FUNCTION IF EXISTS public.aura_my_rank();

CREATE OR REPLACE FUNCTION public.aura_top_ranking(
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  rank               integer,
  profile_id         uuid,
  user_id            uuid,
  name               text,
  username           text,
  avatar_url         text,
  aura_xp            integer,
  aura_level         integer,
  aura_streak_days   integer,
  achievements_count integer,
  visits_received    integer,
  is_self            boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_off int := GREATEST(0, LEAST(COALESCE(p_offset, 0), 99));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id, p.user_id, p.name, p.username, p.avatar_url,
      COALESCE(p.aura_xp, 0)            AS aura_xp,
      COALESCE(p.aura_level, 1)         AS aura_level,
      COALESCE(p.aura_streak_days, 0)   AS aura_streak_days,
      COALESCE(p.voice_bio_score, 0)    AS voice_bio_score,
      p.created_at
    FROM public.profiles p
    WHERE COALESCE(p.is_seed, false) = false
      AND COALESCE(p.is_shadowbanned, false) = false
      AND p.banned_at IS NULL
  ),
  achievements AS (
    SELECT q.user_id, COUNT(*)::int AS achievements_count
      FROM public.oculto_aura_daily_quests q
     WHERE q.claimed_at IS NOT NULL
     GROUP BY q.user_id
  ),
  visits AS (
    SELECT v.visited_id AS user_id, COUNT(DISTINCT v.visitor_id)::int AS visits_received
      FROM public.profile_visits v
     GROUP BY v.visited_id
  ),
  merged AS (
    SELECT
      b.*,
      COALESCE(a.achievements_count, 0) AS achievements_count,
      COALESCE(v.visits_received, 0)    AS visits_received,
      (
        b.aura_xp
        + b.voice_bio_score * 5
        + b.aura_level * 100
        + COALESCE(a.achievements_count, 0) * 20
        + COALESCE(v.visits_received, 0) * 2
      ) AS composite_score
    FROM base b
    LEFT JOIN achievements a ON a.user_id = b.user_id
    LEFT JOIN visits       v ON v.user_id = b.user_id
  ),
  ranked AS (
    SELECT
      m.*,
      ROW_NUMBER() OVER (
        ORDER BY
          m.composite_score DESC,
          m.aura_xp DESC,
          m.created_at ASC
      ) AS rk
    FROM merged m
    WHERE (
      m.aura_xp > 0
      OR m.voice_bio_score > 0
      OR m.achievements_count > 0
      OR m.visits_received > 0
    )
  )
  SELECT
    rk::int               AS rank,
    r.id                  AS profile_id,
    r.user_id,
    r.name,
    r.username,
    r.avatar_url,
    r.aura_xp,
    r.aura_level,
    r.aura_streak_days,
    r.achievements_count,
    r.visits_received,
    (r.user_id = v_uid)   AS is_self
  FROM ranked r
  WHERE r.rk >  v_off
    AND r.rk <= LEAST(100, v_off + v_lim)
  ORDER BY r.rk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_top_ranking(integer, integer) TO authenticated;

-- Mantém aura_my_rank consistente — devolve total + posição com o mesmo
-- score composto. (Idempotente.)
CREATE OR REPLACE FUNCTION public.aura_my_rank()
RETURNS TABLE(
  rank               integer,
  total              integer,
  profile_id         uuid,
  user_id            uuid,
  name               text,
  username           text,
  avatar_url         text,
  aura_xp            integer,
  aura_level         integer,
  aura_streak_days   integer,
  achievements_count integer,
  visits_received    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id, p.user_id, p.name, p.username, p.avatar_url,
      COALESCE(p.aura_xp, 0)            AS aura_xp,
      COALESCE(p.aura_level, 1)         AS aura_level,
      COALESCE(p.aura_streak_days, 0)   AS aura_streak_days,
      COALESCE(p.voice_bio_score, 0)    AS voice_bio_score,
      p.created_at
    FROM public.profiles p
    WHERE COALESCE(p.is_seed, false) = false
      AND COALESCE(p.is_shadowbanned, false) = false
      AND p.banned_at IS NULL
  ),
  achievements AS (
    SELECT q.user_id, COUNT(*)::int AS achievements_count
      FROM public.oculto_aura_daily_quests q
     WHERE q.claimed_at IS NOT NULL
     GROUP BY q.user_id
  ),
  visits AS (
    SELECT v.visited_id AS user_id, COUNT(DISTINCT v.visitor_id)::int AS visits_received
      FROM public.profile_visits v
     GROUP BY v.visited_id
  ),
  merged AS (
    SELECT
      b.*,
      COALESCE(a.achievements_count, 0) AS achievements_count,
      COALESCE(v.visits_received, 0)    AS visits_received,
      (
        b.aura_xp
        + b.voice_bio_score * 5
        + b.aura_level * 100
        + COALESCE(a.achievements_count, 0) * 20
        + COALESCE(v.visits_received, 0) * 2
      ) AS composite_score
    FROM base b
    LEFT JOIN achievements a ON a.user_id = b.user_id
    LEFT JOIN visits       v ON v.user_id = b.user_id
  ),
  ranked AS (
    SELECT
      m.*,
      ROW_NUMBER() OVER (
        ORDER BY m.composite_score DESC, m.aura_xp DESC, m.created_at ASC
      ) AS rk,
      COUNT(*) OVER () AS total_count
    FROM merged m
    WHERE (
      m.aura_xp > 0
      OR m.voice_bio_score > 0
      OR m.achievements_count > 0
      OR m.visits_received > 0
    )
  )
  SELECT
    rk::int    AS rank,
    total_count::int AS total,
    r.id       AS profile_id,
    r.user_id,
    r.name,
    r.username,
    r.avatar_url,
    r.aura_xp,
    r.aura_level,
    r.aura_streak_days,
    r.achievements_count,
    r.visits_received
  FROM ranked r
  WHERE r.user_id = v_uid
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_my_rank() TO authenticated;

NOTIFY pgrst, 'reload schema';
