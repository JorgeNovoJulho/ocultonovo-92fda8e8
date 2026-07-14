-- =========================================================================
-- Retention Metrics — telemetria leve para Prompt 4
-- Banco-alvo: EXTERNO. Idempotente. Cole no SQL Editor do Supabase Externo.
--
-- Reaproveita a tabela existente `public.usage_counters` (sem alterar schema).
-- Adiciona:
--   1) RPC log_retention_view(_feature) → incremento atômico sem rate-limit
--   2) View v_retention_usage_24h     → uso por feature/plano nas últimas 24h
--   3) View v_retention_cohorts       → retenção D1/D7/D30 por dia de signup
--   4) View v_retention_session_avg   → tempo médio de sessão (proxy via
--      profiles.last_seen_at - oculto_active_sessions.created_at quando existir)
-- =========================================================================

-- 1) RPC: log_retention_view ------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_retention_view(_feature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_window  timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  -- Janela horária fixa (alinhada)
  v_window := date_trunc('hour', now());
  INSERT INTO public.usage_counters(user_id, feature, window_start, count, updated_at)
  VALUES (v_user_id, _feature, v_window, 1, now())
  ON CONFLICT (user_id, feature, window_start)
  DO UPDATE SET count = public.usage_counters.count + 1,
                updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.log_retention_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_retention_view(text) TO authenticated;

-- 2) View: uso por feature/plano (24h) -------------------------------------
CREATE OR REPLACE VIEW public.v_retention_usage_24h AS
SELECT
  uc.feature,
  COALESCE(p.plan_type, 'free') AS plan,
  COUNT(DISTINCT uc.user_id)    AS unique_users,
  SUM(uc.count)::bigint         AS total_views,
  MAX(uc.updated_at)            AS last_seen
FROM public.usage_counters uc
LEFT JOIN public.profiles p ON (p.user_id = uc.user_id OR p.id = uc.user_id)
WHERE uc.feature IN (
  'retention_today','retention_journey','retention_ai',
  'retention_history','retention_retrospective'
)
  AND uc.window_start >= now() - interval '24 hours'
GROUP BY uc.feature, COALESCE(p.plan_type, 'free');

ALTER VIEW public.v_retention_usage_24h SET (security_invoker = true);
GRANT SELECT ON public.v_retention_usage_24h TO authenticated;

-- 3) View: cohorts D1/D7/D30 -----------------------------------------------
-- Baseado em profiles.created_at (signup) vs profiles.last_seen_at (retorno).
-- D1 = visto >= signup+1d; D7 = visto >= signup+7d; D30 = visto >= signup+30d.
CREATE OR REPLACE VIEW public.v_retention_cohorts AS
WITH base AS (
  SELECT
    date_trunc('day', created_at)::date AS cohort_day,
    user_id,
    created_at,
    last_seen_at
  FROM public.profiles
  WHERE created_at >= now() - interval '60 days'
)
SELECT
  cohort_day,
  COUNT(*) FILTER (WHERE true) AS signups,
  COUNT(*) FILTER (WHERE last_seen_at >= created_at + interval '1 day')  AS d1,
  COUNT(*) FILTER (WHERE last_seen_at >= created_at + interval '7 days') AS d7,
  COUNT(*) FILTER (WHERE last_seen_at >= created_at + interval '30 days') AS d30
FROM base
GROUP BY cohort_day
ORDER BY cohort_day DESC;

ALTER VIEW public.v_retention_cohorts SET (security_invoker = true);
GRANT SELECT ON public.v_retention_cohorts TO authenticated;

-- 4) View: retorno diário (DAU últimos 14d) ---------------------------------
CREATE OR REPLACE VIEW public.v_retention_dau_14d AS
SELECT
  date_trunc('day', last_seen_at)::date AS day,
  COUNT(DISTINCT user_id)               AS dau
FROM public.profiles
WHERE last_seen_at >= now() - interval '14 days'
GROUP BY 1
ORDER BY 1 DESC;

ALTER VIEW public.v_retention_dau_14d SET (security_invoker = true);
GRANT SELECT ON public.v_retention_dau_14d TO authenticated;

NOTIFY pgrst, 'reload schema';
