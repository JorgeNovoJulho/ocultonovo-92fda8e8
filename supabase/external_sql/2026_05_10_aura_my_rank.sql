-- =====================================================================
-- Aura Match v2 — Bloco E (extensão): minha posição no ranking
-- Permite exibir o rank do usuário mesmo fora do Top N.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_my_rank()
RETURNS TABLE(
  rank        integer,
  total       integer,
  profile_id  uuid,
  user_id     uuid,
  name        text,
  username    text,
  avatar_url  text,
  aura_xp     integer,
  aura_level  integer,
  aura_streak_days integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      p.id, p.user_id, p.name, p.username, p.avatar_url,
      COALESCE(p.aura_xp, 0)         AS aura_xp,
      COALESCE(p.aura_level, 1)      AS aura_level,
      COALESCE(p.aura_streak_days,0) AS aura_streak_days,
      ROW_NUMBER() OVER (ORDER BY COALESCE(p.aura_xp,0) DESC, p.created_at ASC) AS rk,
      COUNT(*) OVER ()               AS total
    FROM public.profiles p
    WHERE COALESCE(p.is_seed, false) = false
      AND COALESCE(p.is_shadowbanned, false) = false
      AND p.banned_at IS NULL
      AND COALESCE(p.aura_xp, 0) > 0
  )
  SELECT
    r.rk::int, r.total::int, r.id, r.user_id, r.name, r.username, r.avatar_url,
    r.aura_xp, r.aura_level, r.aura_streak_days
  FROM ranked r
  WHERE r.user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_my_rank() TO authenticated;
NOTIFY pgrst, 'reload schema';
