-- Tabela de logs de pagamento para auditoria e debug no painel Admin
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL DEFAULT 'asaas',
  event_type  text,
  status      text DEFAULT 'error' CHECK (status IN ('error', 'success', 'info')),
  error_msg   text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamp with time zone DEFAULT now()
);

-- Índices para consultas no painel Admin
CREATE INDEX IF NOT EXISTS idx_payment_logs_provider   ON public.payment_logs (provider);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status     ON public.payment_logs (status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_created_at ON public.payment_logs (created_at DESC);

-- RLS: apenas service_role escreve; admins leem via service_role (edge functions)
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to payment_logs"
  ON public.payment_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
