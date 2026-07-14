-- =====================================================
-- CHECKOUT SENTINEL: Health Check System
-- =====================================================

-- Tabela para logs de health checks
CREATE TABLE IF NOT EXISTS public.checkout_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'critical')),
  response_time_ms integer,
  error_message text,
  details jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- Index para consultas por data
CREATE INDEX IF NOT EXISTS idx_checkout_health_logs_created_at ON public.checkout_health_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_health_logs_status ON public.checkout_health_logs(status);

-- RLS para checkout_health_logs (apenas admins podem ver)
ALTER TABLE public.checkout_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view health logs"
ON public.checkout_health_logs
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "System can insert health logs"
ON public.checkout_health_logs
FOR INSERT
WITH CHECK (true);

-- Tabela para incidentes de checkout
CREATE TABLE IF NOT EXISTS public.checkout_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  title text NOT NULL,
  description text,
  affected_checks text[] DEFAULT ARRAY[]::text[],
  resolved_at timestamp with time zone,
  resolved_by uuid REFERENCES auth.users(id),
  resolution_notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS para checkout_incidents
ALTER TABLE public.checkout_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage incidents"
ON public.checkout_incidents
FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "System can create incidents"
ON public.checkout_incidents
FOR INSERT
WITH CHECK (true);