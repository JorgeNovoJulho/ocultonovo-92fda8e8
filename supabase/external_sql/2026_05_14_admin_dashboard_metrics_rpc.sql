-- ============================================================
-- Oculto — Etapa 2: RPC agregada do dashboard admin
-- ============================================================
-- Substitui ~8 round-trips (COUNTs + SELECT amount) por 1 única
-- chamada SECURITY DEFINER. Usa COUNT/SUM nativo no Postgres.
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller          UUID := auth.uid();
  v_is_admin        BOOLEAN := FALSE;
  v_today           TIMESTAMPTZ := date_trunc('day', now());
  v_one_month_ago   TIMESTAMPTZ := now() - INTERVAL '1 month';
  v_real_users      INT := 0;
  v_seed_users      INT := 0;
  v_creators        INT := 0;
  v_new_today       INT := 0;
  v_last_month      INT := 0;
  v_active_plans    INT := 0;
  v_pending_reports INT := 0;
  v_total_revenue   NUMERIC(14,2) := 0;
  v_growth          NUMERIC(6,2) := 0;
BEGIN
  -- Autorização: admin / master / role
  SELECT TRUE INTO v_is_admin
  FROM public.profiles p
  WHERE p.user_id = v_caller
    AND (
      COALESCE(p.is_admin, FALSE)
      OR LOWER(COALESCE(p.username, '')) = 'ocultomaster'
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_caller
          AND ur.role IN ('admin','moderator')
      )
    )
  LIMIT 1;

  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  -- Métricas em paralelo lógico (Postgres processa cada SELECT eficientemente
  -- via os índices criados em 2026_05_14_global_perf_indexes.sql)
  SELECT COUNT(*) INTO v_real_users
    FROM public.profiles
    WHERE COALESCE(is_seed, FALSE) = FALSE;

  SELECT COUNT(*) INTO v_seed_users
    FROM public.profiles
    WHERE COALESCE(is_seed, FALSE) = TRUE;

  SELECT COUNT(*) INTO v_creators
    FROM public.profiles
    WHERE COALESCE(is_creator, FALSE) = TRUE
      AND COALESCE(is_seed, FALSE) = FALSE;

  SELECT COUNT(*) INTO v_new_today
    FROM public.profiles
    WHERE created_at >= v_today
      AND COALESCE(is_seed, FALSE) = FALSE;

  SELECT COUNT(*) INTO v_last_month
    FROM public.profiles
    WHERE created_at < v_one_month_ago
      AND COALESCE(is_seed, FALSE) = FALSE;

  SELECT COUNT(*) INTO v_active_plans
    FROM public.profiles
    WHERE plan_type IN ('premium','vip')
      AND COALESCE(is_seed, FALSE) = FALSE;

  SELECT COUNT(*) INTO v_pending_reports
    FROM public.anonymous_reports
    WHERE status = 'pending';

  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
    FROM public.transactions
    WHERE status = 'completed';

  IF v_last_month > 0 THEN
    v_growth := ROUND(((v_real_users - v_last_month)::NUMERIC / v_last_month) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'totalRevenue',       v_total_revenue,
    'activeUsers',        v_real_users,
    'newSignupsToday',    v_new_today,
    'pendingReports',     v_pending_reports,
    'totalCreators',      v_creators,
    'totalSubscriptions', v_active_plans,
    'monthlyGrowth',      v_growth,
    'seedUsers',          v_seed_users,
    'realUsers',          v_real_users
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;

-- ============================================================
-- Função utilitária: auto-purge de seeds antigos / inativos
-- (usada pelo cron — mantém base limpa)
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_purge_old_seeds()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
BEGIN
  -- Apaga seeds com mais de 90 dias e sem nenhuma interação humana recente
  WITH targets AS (
    SELECT p.id
      FROM public.profiles p
     WHERE COALESCE(p.is_seed, FALSE) = TRUE
       AND p.created_at < now() - INTERVAL '90 days'
       AND NOT EXISTS (
         SELECT 1 FROM public.posts po
          WHERE po.author_id = p.id
            AND po.created_at > now() - INTERVAL '30 days'
       )
     LIMIT 200  -- batch seguro por execução
  )
  DELETE FROM public.profiles p
   USING targets t
   WHERE p.id = t.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'purged_seeds', v_deleted,
    'ran_at',       now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_purge_old_seeds() TO service_role;
