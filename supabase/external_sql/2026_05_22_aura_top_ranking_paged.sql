-- =====================================================================
-- Aura Match — Top Auras paginado (top 10 → 20 → páginas até 100)
-- Adiciona overload `aura_top_ranking(p_limit, p_offset)` mantendo a
-- versão de 1 parâmetro existente. Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_top_ranking(
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  rank        integer,
  profile_id  uuid,
  user_id     uuid,
  name        text,
  username    text,
  avatar_url  text,
  aura_xp     integer,
  aura_level  integer,
  aura_streak_days integer,
  is_self     boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_off int := GREATEST(0, LEAST(COALESCE(p_offset, 0), 99));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id, p.user_id, p.name, p.username, p.avatar_url,
      COALESCE(p.aura_xp, 0)         AS aura_xp,
      COALESCE(p.aura_level, 1)      AS aura_level,
      COALESCE(p.aura_streak_days,0) AS aura_streak_days,
      ROW_NUMBER() OVER (ORDER BY COALESCE(p.aura_xp,0) DESC, p.created_at ASC) AS rk
    FROM public.profiles p
    WHERE COALESCE(p.is_seed, false) = false
      AND COALESCE(p.is_shadowbanned, false) = false
      AND p.banned_at IS NULL
      AND COALESCE(p.aura_xp, 0) > 0
  )
  SELECT
    rk::int        AS rank,
    r.id           AS profile_id,
    r.user_id,
    r.name,
    r.username,
    r.avatar_url,
    r.aura_xp,
    r.aura_level,
    r.aura_streak_days,
    (r.user_id = v_uid) AS is_self
  FROM ranked r
  WHERE r.rk >  v_off
    AND r.rk <= LEAST(100, v_off + v_lim)
  ORDER BY r.rk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_top_ranking(integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
