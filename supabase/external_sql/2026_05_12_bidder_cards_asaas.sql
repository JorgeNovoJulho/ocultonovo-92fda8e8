-- =====================================================================
-- 2026_05_12_bidder_cards_asaas.sql
-- Migra bidder_cards para tokenização ASAAS (substitui Stripe).
-- 100% idempotente. Não destrói dados existentes.
-- =====================================================================

-- Garante a tabela mínima (caso não exista)
CREATE TABLE IF NOT EXISTS public.bidder_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  card_last_four TEXT,
  card_brand TEXT,
  is_valid BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Colunas ASAAS (substituem stripe_payment_method_id)
ALTER TABLE public.bidder_cards
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_credit_card_token TEXT,
  ADD COLUMN IF NOT EXISTS sandbox_mode BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bidder_cards_asaas_customer
  ON public.bidder_cards (asaas_customer_id);

-- RLS
ALTER TABLE public.bidder_cards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='bidder_cards' AND policyname='bidder_cards_owner_select') THEN
    CREATE POLICY bidder_cards_owner_select ON public.bidder_cards
      FOR SELECT TO authenticated USING (
        user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR user_id = auth.uid()
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
