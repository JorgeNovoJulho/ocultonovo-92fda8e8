-- ============================================================================
-- Split Telemetry — registra cada uso (DB ou fallback) dos percentuais de split
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.split_telemetry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,            -- 'pix-gateway' | 'asaas-card-checkout' | 'daily-financial-report' | etc
  resolved_from TEXT NOT NULL,     -- 'split_config' | 'fallback_constants'
  platform_pct NUMERIC(5,2) NOT NULL,
  tax_pct NUMERIC(5,2) NOT NULL,
  creator_pct NUMERIC(5,2) NOT NULL,
  affiliate_pct NUMERIC(5,2) NOT NULL,
  sum_pct NUMERIC(6,2) GENERATED ALWAYS AS (platform_pct + tax_pct + creator_pct + affiliate_pct) STORED,
  transaction_id UUID NULL,
  gross_amount NUMERIC(10,2) NULL,
  error_msg TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_telemetry_created ON public.split_telemetry_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_telemetry_source  ON public.split_telemetry_logs (source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_telemetry_resolved ON public.split_telemetry_logs (resolved_from, created_at DESC);

ALTER TABLE public.split_telemetry_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins leem
DROP POLICY IF EXISTS "split_telemetry_admin_read" ON public.split_telemetry_logs;
CREATE POLICY "split_telemetry_admin_read"
  ON public.split_telemetry_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role escreve
DROP POLICY IF EXISTS "split_telemetry_service_write" ON public.split_telemetry_logs;
CREATE POLICY "split_telemetry_service_write"
  ON public.split_telemetry_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── RPC para resumo agregado (últimos N dias) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_split_telemetry_summary(p_days INT DEFAULT 7)
RETURNS TABLE (
  source TEXT,
  resolved_from TEXT,
  total_calls BIGINT,
  last_seen TIMESTAMPTZ,
  avg_platform NUMERIC,
  avg_tax NUMERIC,
  avg_creator NUMERIC,
  avg_affiliate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    source,
    resolved_from,
    COUNT(*)::bigint AS total_calls,
    MAX(created_at) AS last_seen,
    ROUND(AVG(platform_pct)::numeric, 2)  AS avg_platform,
    ROUND(AVG(tax_pct)::numeric, 2)       AS avg_tax,
    ROUND(AVG(creator_pct)::numeric, 2)   AS avg_creator,
    ROUND(AVG(affiliate_pct)::numeric, 2) AS avg_affiliate
  FROM public.split_telemetry_logs
  WHERE created_at >= now() - (p_days || ' days')::interval
  GROUP BY source, resolved_from
  ORDER BY COUNT(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_split_telemetry_summary(INT) TO authenticated;
