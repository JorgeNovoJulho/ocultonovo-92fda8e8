-- ============================================================================
-- PROMPT 8 — Hardening payments_log + idempotência ASAAS PIX
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ============================================================================

-- 0) Garante a tabela payments_log (caso não exista no externo)
CREATE TABLE IF NOT EXISTS public.payments_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  post_id UUID,
  creator_id UUID,
  amount NUMERIC(10,2),
  provider TEXT,
  external_id TEXT,
  status TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

-- 1) Garante TODAS as colunas usadas adiante (defensivo)
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS user_id        UUID;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS post_id        UUID;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS creator_id     UUID;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS amount         NUMERIC(10,2);
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS provider       TEXT;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS external_id    TEXT;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS status         TEXT;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS metadata       JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.payments_log ADD COLUMN IF NOT EXISTS confirmed_at   TIMESTAMPTZ;

-- 2) Índice único parcial: bloqueia duplicidade de cobrança ASAAS
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_log_external_id_unique
  ON public.payments_log (external_id)
  WHERE external_id IS NOT NULL;

-- 3) Índices auxiliares
CREATE INDEX IF NOT EXISTS idx_payments_log_user_post_status
  ON public.payments_log (user_id, post_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_log_status
  ON public.payments_log (status);

CREATE INDEX IF NOT EXISTS idx_payments_log_creator
  ON public.payments_log (creator_id);

-- 4) RLS reforçado (idempotente)
ALTER TABLE public.payments_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payments" ON public.payments_log;
CREATE POLICY "Users can view own payments"
  ON public.payments_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Creators can view incoming payments" ON public.payments_log;
CREATE POLICY "Creators can view incoming payments"
  ON public.payments_log FOR SELECT
  TO authenticated
  USING (
    creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR creator_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create own payments" ON public.payments_log;
CREATE POLICY "Users can create own payments"
  ON public.payments_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can update payments" ON public.payments_log;
CREATE POLICY "Service role can update payments"
  ON public.payments_log FOR UPDATE
  TO authenticated
  USING (true);

-- 5) Padroniza sandbox em system_settings (chave única de verdade)
INSERT INTO public.system_settings (key, value)
VALUES ('asaas_sandbox_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 6) Garante que transactions tem as colunas usadas pela view
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS seller_id    UUID;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS provider     TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS external_id  TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}'::jsonb;

-- 7) View unificada payments_log + transactions
DROP VIEW IF EXISTS public.v_unified_payments;
CREATE VIEW public.v_unified_payments AS
SELECT
  pl.id                             AS log_id,
  pl.user_id,
  pl.creator_id,
  pl.post_id,
  pl.amount,
  pl.provider,
  pl.external_id,
  pl.status,
  pl.metadata,
  pl.created_at,
  pl.confirmed_at,
  'payments_log'::text              AS source,
  NULL::uuid                        AS transaction_id
FROM public.payments_log pl
UNION ALL
SELECT
  NULL::uuid                        AS log_id,
  t.user_id,
  t.seller_id                       AS creator_id,
  NULL::uuid                        AS post_id,
  t.amount,
  COALESCE(t.provider,'unknown')    AS provider,
  t.external_id,
  t.status,
  COALESCE(t.metadata,'{}'::jsonb)  AS metadata,
  t.created_at,
  CASE WHEN t.status='completed' THEN t.updated_at END AS confirmed_at,
  'transactions'::text              AS source,
  t.id                              AS transaction_id
FROM public.transactions t;

COMMENT ON VIEW public.v_unified_payments IS
  'Fonte unificada de pagamentos (payments_log + transactions) para relatórios admin.';

ALTER VIEW public.v_unified_payments SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
