-- ============================================================
-- Oculto — Painel Admin de Cron Jobs (pg_cron)
-- ============================================================
-- 2 RPCs SECURITY DEFINER:
--   * list_oculto_cron_jobs()    — lista jobs 'oculto-*' + última execução
--   * run_oculto_cron_now(text)  — dispara o command de um job (admin only)
-- Idempotente.
-- ============================================================

-- Helper interno: confere se caller é admin
CREATE OR REPLACE FUNCTION public._is_oculto_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND (
         COALESCE(p.is_admin, FALSE)
         OR LOWER(COALESCE(p.username, '')) = 'ocultomaster'
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('admin','moderator')
         )
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_oculto_admin() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 1) LISTAR JOBS oculto-* + última execução
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_oculto_cron_jobs()
RETURNS TABLE (
  jobid           BIGINT,
  jobname         TEXT,
  schedule        TEXT,
  command         TEXT,
  active          BOOLEAN,
  last_run_start  TIMESTAMPTZ,
  last_run_end    TIMESTAMPTZ,
  last_status     TEXT,
  last_return_msg TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public._is_oculto_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  RETURN QUERY
  SELECT
    j.jobid,
    j.jobname::TEXT,
    j.schedule::TEXT,
    j.command::TEXT,
    j.active,
    last_run.start_time,
    last_run.end_time,
    last_run.status::TEXT,
    last_run.return_message::TEXT
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.end_time, d.status, d.return_message
      FROM cron.job_run_details d
     WHERE d.jobid = j.jobid
     ORDER BY d.start_time DESC
     LIMIT 1
  ) last_run ON TRUE
  WHERE j.jobname LIKE 'oculto-%'
  ORDER BY j.jobname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_oculto_cron_jobs() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2) DISPARAR JOB AGORA (executa o command imediatamente)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_oculto_cron_now(p_jobname TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_command  TEXT;
  v_started  TIMESTAMPTZ := now();
BEGIN
  IF NOT public._is_oculto_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  -- Apenas jobs oculto-* podem ser disparados manualmente
  IF p_jobname IS NULL OR p_jobname NOT LIKE 'oculto-%' THEN
    RAISE EXCEPTION 'invalid jobname (must start with oculto-)';
  END IF;

  SELECT command INTO v_command
    FROM cron.job
   WHERE jobname = p_jobname
   LIMIT 1;

  IF v_command IS NULL THEN
    RAISE EXCEPTION 'job not found: %', p_jobname;
  END IF;

  -- Executa o command dinamicamente
  EXECUTE v_command;

  RETURN jsonb_build_object(
    'jobname',     p_jobname,
    'executed_at', v_started,
    'duration_ms', EXTRACT(MILLISECONDS FROM (now() - v_started))::INT,
    'ok',          true
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'jobname',     p_jobname,
    'executed_at', v_started,
    'ok',          false,
    'error',       SQLERRM
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_oculto_cron_now(TEXT) TO authenticated;
