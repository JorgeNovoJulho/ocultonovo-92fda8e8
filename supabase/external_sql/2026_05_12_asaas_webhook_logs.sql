-- =====================================================================
-- Logs dedicados + idempotência do Webhook ASAAS
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente — pode ser rodado várias vezes
-- =====================================================================

-- 1) Tabela de logs
CREATE TABLE IF NOT EXISTS public.oculto_asaas_webhook_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asaas_event_id  TEXT UNIQUE,           -- idempotência
  event_type      TEXT,
  payment_id      TEXT,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'received', -- received | processed | duplicated | failed | ignored
  error_message   TEXT,
  processing_ms   INTEGER,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

-- 2) Índices úteis
CREATE INDEX IF NOT EXISTS idx_oculto_asaas_webhook_logs_event_type_received
  ON public.oculto_asaas_webhook_logs (event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_asaas_webhook_logs_status_received
  ON public.oculto_asaas_webhook_logs (status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_asaas_webhook_logs_payment_id
  ON public.oculto_asaas_webhook_logs (payment_id);

-- 3) RLS
ALTER TABLE public.oculto_asaas_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas (idempotente)
DROP POLICY IF EXISTS "asaas_logs_master_select" ON public.oculto_asaas_webhook_logs;
DROP POLICY IF EXISTS "asaas_logs_service_all"  ON public.oculto_asaas_webhook_logs;

-- Service role faz tudo (webhook escreve, jobs leem)
CREATE POLICY "asaas_logs_service_all"
ON public.oculto_asaas_webhook_logs
AS PERMISSIVE
FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- Apenas Admin Master pode ler via cliente
-- (assume função public.is_master_admin(uid uuid) já existente — fallback abaixo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_master_admin'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "asaas_logs_master_select"
      ON public.oculto_asaas_webhook_logs
      FOR SELECT
      TO authenticated
      USING (public.is_master_admin(auth.uid()))
    $POL$;
  ELSE
    -- Fallback: bloqueia leitura pelo client; só service role acessa
    EXECUTE $POL$
      CREATE POLICY "asaas_logs_master_select"
      ON public.oculto_asaas_webhook_logs
      FOR SELECT
      TO authenticated
      USING (false)
    $POL$;
  END IF;
END $$;

-- 4) Comentários
COMMENT ON TABLE public.oculto_asaas_webhook_logs IS
  'Logs brutos + idempotência por evento do webhook ASAAS. Conflito em asaas_event_id => evento duplicado, retorna 200 sem reprocessar.';
