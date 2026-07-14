-- =====================================================================
-- Auditoria de chamadas/decisões antifraude + visões operacionais ASAAS
-- Idempotente. Roda no Supabase EXTERNO.
-- =====================================================================

-- 1) Tabela de auditoria de decisões antifraude (high/critical + under_review)
CREATE TABLE IF NOT EXISTS public.oculto_fraud_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  scope           TEXT NOT NULL,            -- 'incident' | 'withdraw_review' | 'wallet_freeze' | 'manual'
  severity        TEXT,                     -- low | medium | high | critical
  rule_code       TEXT,
  decision        TEXT NOT NULL,            -- 'flagged' | 'frozen' | 'cleared' | 'reviewed' | 'auto'
  reason          TEXT,
  ref_id          UUID,                     -- incident_id ou withdraw_id
  actor_id        UUID,                     -- admin que tomou a ação (se manual)
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_audit_created     ON public.oculto_fraud_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_user        ON public.oculto_fraud_audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_severity    ON public.oculto_fraud_audit_log (severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_audit_scope       ON public.oculto_fraud_audit_log (scope, created_at DESC);

ALTER TABLE public.oculto_fraud_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_audit_master_select" ON public.oculto_fraud_audit_log;
DROP POLICY IF EXISTS "fraud_audit_service_all"   ON public.oculto_fraud_audit_log;

CREATE POLICY "fraud_audit_service_all"
ON public.oculto_fraud_audit_log
AS PERMISSIVE FOR ALL TO service_role
USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p
              JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='is_master_admin') THEN
    EXECUTE $POL$
      CREATE POLICY "fraud_audit_master_select"
      ON public.oculto_fraud_audit_log
      FOR SELECT TO authenticated
      USING (public.is_master_admin(auth.uid()))
    $POL$;
  ELSE
    EXECUTE $POL$
      CREATE POLICY "fraud_audit_master_select"
      ON public.oculto_fraud_audit_log
      FOR SELECT TO authenticated USING (false)
    $POL$;
  END IF;
END $$;

-- 2) Trigger: incidentes high/critical -> audit_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='oculto_fraud_incidents') THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.trg_fraud_incident_to_audit()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
      BEGIN
        IF NEW.severity IN ('high','critical') THEN
          INSERT INTO public.oculto_fraud_audit_log
            (user_id, scope, severity, rule_code, decision, reason, ref_id, metadata)
          VALUES
            (NEW.user_id, 'incident', NEW.severity, NEW.rule_code,
             'flagged', NEW.reason, NEW.id, COALESCE(NEW.metadata,'{}'::jsonb));
        END IF;
        RETURN NEW;
      END; $f$;
    $body$;
    DROP TRIGGER IF EXISTS trg_fraud_incident_to_audit ON public.oculto_fraud_incidents;
    CREATE TRIGGER trg_fraud_incident_to_audit
      AFTER INSERT ON public.oculto_fraud_incidents
      FOR EACH ROW EXECUTE FUNCTION public.trg_fraud_incident_to_audit();
  END IF;
END $$;

-- 3) Trigger: withdraw under_review -> audit_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='withdraw_requests') THEN
    EXECUTE $body$
      CREATE OR REPLACE FUNCTION public.trg_withdraw_review_to_audit()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $f$
      BEGIN
        IF NEW.status = 'under_review' AND (OLD.status IS DISTINCT FROM 'under_review') THEN
          INSERT INTO public.oculto_fraud_audit_log
            (user_id, scope, severity, decision, reason, ref_id, metadata)
          VALUES
            (NEW.user_id, 'withdraw_review', 'high', 'flagged',
             'Saque marcado como under_review', NEW.id,
             jsonb_build_object('amount', NEW.amount));
        END IF;
        RETURN NEW;
      END; $f$;
    $body$;
    DROP TRIGGER IF EXISTS trg_withdraw_review_to_audit ON public.withdraw_requests;
    CREATE TRIGGER trg_withdraw_review_to_audit
      AFTER INSERT OR UPDATE OF status ON public.withdraw_requests
      FOR EACH ROW EXECUTE FUNCTION public.trg_withdraw_review_to_audit();
  END IF;
END $$;

-- 4) View operacional: status do webhook ASAAS
CREATE OR REPLACE VIEW public.v_admin_asaas_ops_status AS
WITH base AS (
  SELECT * FROM public.oculto_asaas_webhook_logs
   WHERE received_at >= NOW() - INTERVAL '24 hours'
)
SELECT
  (SELECT MAX(received_at)  FROM public.oculto_asaas_webhook_logs)              AS last_event_at,
  (SELECT MAX(processed_at) FROM public.oculto_asaas_webhook_logs
                             WHERE status='processed')                          AS last_processed_at,
  COUNT(*)                                                  AS events_24h,
  COUNT(*) FILTER (WHERE status='processed')                AS processed_24h,
  COUNT(*) FILTER (WHERE status='duplicated')               AS duplicated_24h,
  COUNT(*) FILTER (WHERE status='failed')                   AS failed_24h,
  COUNT(*) FILTER (WHERE status='ignored')                  AS ignored_24h,
  COALESCE(AVG(processing_ms) FILTER (WHERE status='processed'), 0)::int AS avg_latency_ms,
  COALESCE(MAX(processing_ms) FILTER (WHERE status='processed'), 0)::int AS max_latency_ms,
  CASE
    WHEN COUNT(*) FILTER (WHERE status='failed') > 5 THEN 'unhealthy'
    WHEN (SELECT MAX(received_at) FROM public.oculto_asaas_webhook_logs) <
         NOW() - INTERVAL '6 hours' THEN 'stale'
    ELSE 'healthy'
  END AS health
FROM base;

GRANT SELECT ON public.v_admin_asaas_ops_status TO authenticated, service_role;

-- 5) View: contadores por tipo de evento (24h)
CREATE OR REPLACE VIEW public.v_admin_asaas_events_by_type AS
SELECT
  event_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status='processed')  AS processed,
  COUNT(*) FILTER (WHERE status='failed')     AS failed,
  COUNT(*) FILTER (WHERE status='duplicated') AS duplicated,
  MAX(received_at) AS last_at
FROM public.oculto_asaas_webhook_logs
WHERE received_at >= NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY total DESC;

GRANT SELECT ON public.v_admin_asaas_events_by_type TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
