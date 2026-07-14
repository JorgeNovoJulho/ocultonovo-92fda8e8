-- =============================================================================
-- PIX GATEWAY — Safety Net SQL (idempotente)
-- Data: 2026-05-06
-- Objetivo: garantir que TODAS as estruturas de DB usadas pelas edge functions
--           pix-gateway e pix-webhook estejam presentes e corretas.
--
-- IMPORTANTE: Este SQL NÃO resolve o erro 404 da edge function `pix-gateway`.
-- O 404 acontece porque a função ainda não está deployada no Supabase externo.
-- Para resolver o 404, rode no terminal local:
--
--   supabase link --project-ref rvybbrkzmboqbhcemqar
--   supabase functions deploy pix-gateway pix-webhook --no-verify-jwt
--
-- Este SQL apenas garante que, quando o deploy acontecer, tudo funcione.
-- =============================================================================

-- 1) Cria tabela pix_gateway_config se não existir ---------------------------
CREATE TABLE IF NOT EXISTS public.pix_gateway_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_provider            text NOT NULL DEFAULT 'asaas',
  api_key_encrypted           text,
  webhook_secret_encrypted    text,
  is_active                   boolean NOT NULL DEFAULT false,
  sandbox_mode                boolean NOT NULL DEFAULT true,
  pix_key                     text,
  pix_key_type                text CHECK (pix_key_type IN ('cpf','cnpj','email','phone','random')),
  min_deposit                 numeric(10,2) NOT NULL DEFAULT 5,
  max_deposit                 numeric(10,2) NOT NULL DEFAULT 10000,
  discord_webhook_url         text,
  updated_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pix_gateway_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage pix gateway config" ON public.pix_gateway_config;
CREATE POLICY "Admins manage pix gateway config"
  ON public.pix_gateway_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin','admin_master')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin','admin_master')
    )
  );

DROP POLICY IF EXISTS "Service role manages pix gateway config" ON public.pix_gateway_config;
CREATE POLICY "Service role manages pix gateway config"
  ON public.pix_gateway_config FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Garante linha única em pix_gateway_config (insere DEFAULT se vazio) --------
INSERT INTO public.pix_gateway_config (gateway_provider, is_active, sandbox_mode)
SELECT 'asaas', false, true
WHERE NOT EXISTS (SELECT 1 FROM public.pix_gateway_config);

-- 2) webhook_events — usada pelo painel /admin/webhook-events ----------------
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  event_type    text NOT NULL,
  event_id      text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processed','failed','ignored')),
  error_message text,
  processed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider
  ON public.webhook_events (provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_status
  ON public.webhook_events (provider, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_events_provider_event
  ON public.webhook_events (provider, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON public.webhook_events (created_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook events" ON public.webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON public.webhook_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin','admin_master')
    )
  );

-- Permite que a service_role (usada pelas edge functions) sempre escreva
DROP POLICY IF EXISTS "Service role manages webhook events" ON public.webhook_events;
CREATE POLICY "Service role manages webhook events"
  ON public.webhook_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) Colunas opcionais em transactions usadas pelo pix-webhook ---------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='external_id'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN external_id text;
    CREATE INDEX IF NOT EXISTS idx_transactions_external_id
      ON public.transactions (external_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='provider'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN provider text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='completed_at'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='pix_code'
  ) THEN
    ALTER TABLE public.transactions ADD COLUMN pix_code text;
  END IF;
END $$;

-- 4) Confirmação ------------------------------------------------------------
SELECT
  'pix_gateway_config rows' AS check, COUNT(*)::text AS value
  FROM public.pix_gateway_config
UNION ALL
SELECT 'webhook_events exists', 'yes'
UNION ALL
SELECT 'transactions.external_id', column_name
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='transactions' AND column_name='external_id';
