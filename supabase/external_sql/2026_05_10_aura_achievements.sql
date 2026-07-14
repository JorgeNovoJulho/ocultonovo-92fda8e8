-- =====================================================================
-- Aura Match v2 — Bloco D: Métricas para Conquistas
-- RPC única que devolve os números brutos; o catálogo de badges fica no front.
-- Idempotente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp        integer,
  current_level   integer,
  current_streak  integer,
  visit_days      integer,
  quests_claimed  integer,
  super_dm_quests integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT aura_xp           FROM public.profiles WHERE user_id = v_uid), 0),
    COALESCE((SELECT aura_level        FROM public.profiles WHERE user_id = v_uid), 1),
    COALESCE((SELECT aura_streak_days  FROM public.profiles WHERE user_id = v_uid), 0),
    COALESCE((SELECT COUNT(DISTINCT day)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid), 0),
    COALESCE((SELECT COUNT(*)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid
                 AND quest_key = 'send_super_dm'
                 AND claimed_at IS NOT NULL), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;
NOTIFY pgrst, 'reload schema';
