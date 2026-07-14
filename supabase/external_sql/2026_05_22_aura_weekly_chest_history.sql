-- =====================================================================
-- Aura Weekly Chest — Histórico do usuário
-- RPC: aura_weekly_chest_history(p_limit int default 12)
-- Retorna últimas aberturas do usuário (claimed_at, week_key, xp, super_dm, nível).
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_history(p_limit int DEFAULT 12)
RETURNS TABLE(
  week_key         text,
  claimed_at       timestamptz,
  level_at_claim   int,
  xp_awarded       int,
  super_dm_awarded int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int  := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 52);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT c.week_key, c.claimed_at, c.level_at_claim, c.xp_awarded, c.super_dm_awarded
    FROM public.oculto_aura_weekly_chests c
   WHERE c.user_id = v_uid
   ORDER BY c.claimed_at DESC
   LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_history(int) TO authenticated;
NOTIFY pgrst, 'reload schema';
