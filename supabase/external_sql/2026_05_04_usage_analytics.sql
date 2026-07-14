-- ============================================================
-- Observabilidade: agregados de uso por feature/plano (24h, 7d)
-- Banco-alvo: EXTERNO (rvybbrkzmboqbhcemqar). Idempotente.
-- ============================================================

CREATE OR REPLACE VIEW public.v_usage_stats_24h AS
SELECT
  uc.feature,
  COALESCE(p.plan_type, 'free') AS plan,
  COUNT(DISTINCT uc.user_id)    AS unique_users,
  SUM(uc.count)::bigint         AS total_actions,
  MAX(uc.updated_at)            AS last_seen
FROM public.usage_counters uc
LEFT JOIN public.profiles p ON (p.user_id = uc.user_id OR p.id = uc.user_id)
WHERE uc.window_start >= now() - interval '24 hours'
GROUP BY uc.feature, COALESCE(p.plan_type, 'free');

ALTER VIEW public.v_usage_stats_24h SET (security_invoker = true);

CREATE OR REPLACE VIEW public.v_usage_stats_7d AS
SELECT
  date_trunc('hour', uc.window_start) AS bucket,
  uc.feature,
  COALESCE(p.plan_type, 'free') AS plan,
  SUM(uc.count)::bigint AS total_actions
FROM public.usage_counters uc
LEFT JOIN public.profiles p ON (p.user_id = uc.user_id OR p.id = uc.user_id)
WHERE uc.window_start >= now() - interval '7 days'
GROUP BY 1, uc.feature, COALESCE(p.plan_type, 'free')
ORDER BY 1 DESC;

ALTER VIEW public.v_usage_stats_7d SET (security_invoker = true);

-- RPC: top users que mais consomem uma feature (admin only)
CREATE OR REPLACE FUNCTION public.usage_top_users(_feature text, _limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, total bigint, plan text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    uc.user_id,
    SUM(uc.count)::bigint AS total,
    COALESCE(p.plan_type, 'free') AS plan
  FROM public.usage_counters uc
  LEFT JOIN public.profiles p ON (p.user_id = uc.user_id OR p.id = uc.user_id)
  WHERE uc.feature = _feature
    AND uc.window_start >= now() - interval '24 hours'
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY uc.user_id, COALESCE(p.plan_type, 'free')
  ORDER BY total DESC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.usage_top_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usage_top_users(text, int) TO authenticated;

GRANT SELECT ON public.v_usage_stats_24h TO authenticated;
GRANT SELECT ON public.v_usage_stats_7d  TO authenticated;
