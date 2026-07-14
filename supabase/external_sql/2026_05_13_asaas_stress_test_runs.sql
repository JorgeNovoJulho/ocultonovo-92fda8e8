-- =====================================================================
-- Stress Test ASAAS — tabela de runs + flag stress_test em logs
-- 100% idempotente.
-- =====================================================================

-- 1) Marcador stress_test no webhook log (para cleanup seguro)
ALTER TABLE public.oculto_asaas_webhook_logs
  ADD COLUMN IF NOT EXISTS stress_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_asaas_webhook_logs_stress
  ON public.oculto_asaas_webhook_logs (stress_test, received_at DESC);

-- 2) Marcador stress_test no split log
ALTER TABLE public.transaction_split_logs
  ADD COLUMN IF NOT EXISTS stress_test BOOLEAN NOT NULL DEFAULT false;

-- 3) Tabela de runs (auditoria + rate limit)
CREATE TABLE IF NOT EXISTS public.oculto_stress_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by UUID NOT NULL,
  scenario TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stress_runs_user_time
  ON public.oculto_stress_test_runs (triggered_by, started_at DESC);

ALTER TABLE public.oculto_stress_test_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='oculto_stress_test_runs' AND policyname='stress_runs_admin_select') THEN
    CREATE POLICY stress_runs_admin_select ON public.oculto_stress_test_runs
      FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.profiles
                 WHERE user_id = auth.uid()
                   AND (username = 'ocultomaster' OR is_admin = true))
      );
  END IF;
END $$;

-- 4) Cleanup helper: limpa logs sintéticos antigos (>1h)
CREATE OR REPLACE FUNCTION public.cleanup_stress_test_artifacts()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_logs INT; v_splits INT;
BEGIN
  WITH d AS (
    DELETE FROM public.oculto_asaas_webhook_logs
     WHERE stress_test = true AND received_at < now() - INTERVAL '1 hour'
     RETURNING 1
  ) SELECT COUNT(*) INTO v_logs FROM d;

  WITH d AS (
    DELETE FROM public.transaction_split_logs
     WHERE stress_test = true AND created_at < now() - INTERVAL '1 hour'
     RETURNING 1
  ) SELECT COUNT(*) INTO v_splits FROM d;

  RETURN jsonb_build_object('webhook_logs_deleted', v_logs, 'split_logs_deleted', v_splits);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stress_test_artifacts() TO authenticated;

NOTIFY pgrst, 'reload schema';
