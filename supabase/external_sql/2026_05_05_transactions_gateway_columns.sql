-- ============================================================================
-- Transactions schema upgrade — adiciona colunas que o código TS já espera.
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Colunas de gateway / split / categorização
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider     TEXT,
  ADD COLUMN IF NOT EXISTS external_id  TEXT,
  ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS seller_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category     TEXT;

-- 2) Garante precisão monetária correta (decimal(10,2))
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions'
      AND column_name='amount' AND data_type='numeric'
      AND (numeric_precision IS DISTINCT FROM 10 OR numeric_scale IS DISTINCT FROM 2)
  ) THEN
    ALTER TABLE public.transactions ALTER COLUMN amount TYPE numeric(10,2);
  END IF;
END $$;

-- 3) Índices (acelera webhooks PIX/Stripe e relatórios)
CREATE INDEX IF NOT EXISTS idx_transactions_provider          ON public.transactions(provider);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id       ON public.transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status_provider   ON public.transactions(status, provider);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_status     ON public.transactions(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_affiliate_status  ON public.transactions(affiliate_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_category          ON public.transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_expires_at        ON public.transactions(expires_at)
  WHERE status = 'pending';

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_transactions_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_updated_at ON public.transactions;
CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_transactions_set_updated_at();

-- 5) RLS — adiciona política de leitura para vendedor e afiliado (além do dono)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_seller" ON public.transactions;
CREATE POLICY "transactions_select_seller"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    seller_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "transactions_select_affiliate" ON public.transactions;
CREATE POLICY "transactions_select_affiliate"
  ON public.transactions FOR SELECT
  TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );
