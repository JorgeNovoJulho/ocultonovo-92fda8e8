
-- ============================================================
-- Motor de Split Dual: process_payment_split
-- Função atômica que calcula e distribui valores em uma única
-- transação SQL, garantindo consistência total.
-- ============================================================

-- 1. Tabela de logs detalhados de split (transaction_split_logs)
CREATE TABLE IF NOT EXISTS public.transaction_split_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  payment_external_id TEXT NOT NULL,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('platform_plan', 'creator_content', 'wallet_topup')),
  gross_amount DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,4) NOT NULL DEFAULT 0.06,
  base_amount DECIMAL(10,2) NOT NULL,
  platform_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  platform_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  affiliate_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  affiliate_rate DECIMAL(5,4) NOT NULL DEFAULT 0.05,
  creator_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  creator_id UUID,
  affiliate_id UUID,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_split_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on split logs"
  ON public.transaction_split_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_split_logs_tx ON public.transaction_split_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_split_logs_ext ON public.transaction_split_logs(payment_external_id);

-- 2. Função atômica de split dual
CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id TEXT,
  p_payment_external_id TEXT,
  p_flow_type TEXT,           -- 'platform_plan' | 'creator_content'
  p_gross_amount DECIMAL(10,2),
  p_creator_id UUID DEFAULT NULL,
  p_affiliate_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT 'platform'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tax_rate DECIMAL(5,4) := 0.06;
  v_tax DECIMAL(10,2);
  v_base DECIMAL(10,2);
  v_platform_rate DECIMAL(5,4);
  v_platform DECIMAL(10,2);
  v_affiliate_rate DECIMAL(5,4) := 0.05;
  v_affiliate DECIMAL(10,2) := 0;
  v_creator DECIMAL(10,2) := 0;
  v_result JSONB;
BEGIN
  -- Calcular imposto (6% do bruto)
  v_tax := ROUND(p_gross_amount * v_tax_rate, 2);
  -- Base líquida
  v_base := ROUND(p_gross_amount - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    -- ══ FLUXO PLATAFORMA ══
    -- Casa fica com 95% da base, Indicador 5% (se houver)
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform := ROUND(v_base - v_affiliate, 2);
      v_platform_rate := 0.95;
    ELSE
      v_platform := v_base;
      v_platform_rate := 1.00;
    END IF;
    v_creator := 0;

  ELSIF p_flow_type = 'creator_content' THEN
    -- ══ FLUXO CRIADOR ══
    -- Casa 20% da base, Indicador 5% (se houver), Criador = restante
    v_platform_rate := 0.20;
    v_platform := ROUND(v_base * v_platform_rate, 2);

    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;

    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);

  ELSE
    -- Wallet top-up: sem split
    v_platform := 0;
    v_creator := 0;
    v_affiliate := 0;
    v_platform_rate := 0;
  END IF;

  -- ══ ATUALIZAR SALDOS ATOMICAMENTE ══

  -- Creditar criador (pending_balance com retenção de 7 dias)
  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE profiles
      SET pending_balance = COALESCE(pending_balance, 0) + v_creator
      WHERE id = p_creator_id;

    -- Agendar liberação em 7 dias
    INSERT INTO pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Creditar afiliado (pending_balance com retenção de 7 dias)
  IF v_affiliate > 0 AND p_affiliate_id IS NOT NULL THEN
    UPDATE profiles
      SET pending_balance = COALESCE(pending_balance, 0) + v_affiliate
      WHERE id = p_affiliate_id;

    INSERT INTO pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_affiliate_id, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- ══ REGISTRAR LOG DETALHADO ══
  INSERT INTO transaction_split_logs (
    transaction_id, payment_external_id, flow_type,
    gross_amount, tax_amount, tax_rate, base_amount,
    platform_amount, platform_rate,
    affiliate_amount, affiliate_rate,
    creator_amount, creator_id, affiliate_id, provider
  ) VALUES (
    p_transaction_id, p_payment_external_id, p_flow_type,
    p_gross_amount, v_tax, v_tax_rate, v_base,
    v_platform, v_platform_rate,
    v_affiliate, v_affiliate_rate,
    v_creator, p_creator_id, p_affiliate_id, p_provider
  );

  -- Resultado para o webhook
  v_result := jsonb_build_object(
    'gross', p_gross_amount,
    'tax', v_tax,
    'base', v_base,
    'platform', v_platform,
    'affiliate', v_affiliate,
    'creator', v_creator,
    'flow_type', p_flow_type
  );

  RETURN v_result;
END;
$$;
