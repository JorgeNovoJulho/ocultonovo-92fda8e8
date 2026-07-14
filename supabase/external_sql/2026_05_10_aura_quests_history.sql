-- =====================================================================
-- Aura Match v2 — Histórico de missões diárias (últimos N dias)
-- Idempotente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.aura_quests_history(p_days integer DEFAULT 7)
RETURNS TABLE(
  day date,
  total integer,
  completed integer,
  claimed integer,
  xp_earned integer
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT q.day,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE q.progress >= q.target)::int AS completed,
         COUNT(*) FILTER (WHERE q.claimed_at IS NOT NULL)::int AS claimed,
         COALESCE(SUM(q.xp_reward) FILTER (WHERE q.claimed_at IS NOT NULL), 0)::int AS xp_earned
    FROM public.oculto_aura_daily_quests q
   WHERE q.user_id = auth.uid()
     AND q.day >= ((now() at time zone 'America/Sao_Paulo')::date - GREATEST(p_days,1) + 1)
   GROUP BY q.day
   ORDER BY q.day DESC;
$$;

GRANT EXECUTE ON FUNCTION public.aura_quests_history(integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
