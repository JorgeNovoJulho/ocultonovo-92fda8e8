-- ============================================================
-- Afiliado Condicional — validação backend + transparência
-- Idempotente. Estende process_payment_split sem mudar assinatura.
--
-- Regras:
--  • Auto-indicação proibida (referrer == referred)
--  • Referrer e referred precisam existir em public.profiles
--  • Nenhum dos dois pode estar banido (banned_at IS NOT NULL)
--  • Referrer não pode estar shadowbanned (is_shadowbanned)
--  • Referrer não pode estar marcado como fraude na tabela fraud_signals (se existir)
--  • Se o afiliado for inválido → fatia volta INTEGRAL ao criador
--  • Toda decisão é registrada em affiliate_split_audit
-- ============================================================

-- 1. Auditoria de validação afiliado por transação
CREATE TABLE IF NOT EXISTS public.affiliate_split_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL,
  payment_external_id TEXT,
  referred_user_id UUID,
  affiliate_id_input UUID,
  affiliate_id_applied UUID,
  is_valid BOOLEAN NOT NULL,
  rejection_reason TEXT,
  affiliate_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  creator_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_audit_tx ON public.affiliate_split_audit (transaction_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_audit_aff ON public.affiliate_split_audit (affiliate_id_applied) WHERE affiliate_id_applied IS NOT NULL;

ALTER TABLE public.affiliate_split_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_audit_admin_read" ON public.affiliate_split_audit;
CREATE POLICY "affiliate_audit_admin_read"
  ON public.affiliate_split_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('admin','admin_master'))
    OR affiliate_id_applied IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 2. Transparência em payment_splits
ALTER TABLE public.payment_splits
  ADD COLUMN IF NOT EXISTS affiliate_id UUID,
  ADD COLUMN IF NOT EXISTS affiliate_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS affiliate_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS affiliate_rejection_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_splits_affiliate_id_fkey'
  ) THEN
    ALTER TABLE public.payment_splits
      ADD CONSTRAINT payment_splits_affiliate_id_fkey
      FOREIGN KEY (affiliate_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Função pura de validação (reusável no frontend via RPC)
CREATE OR REPLACE FUNCTION public.validate_affiliate_link(
  p_referred_user_id UUID,
  p_affiliate_id UUID
)
RETURNS TABLE (is_valid BOOLEAN, reason TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref RECORD;
  v_aff RECORD;
BEGIN
  IF p_affiliate_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'no_affiliate'; RETURN;
  END IF;

  IF p_referred_user_id = p_affiliate_id THEN
    RETURN QUERY SELECT FALSE, 'self_referral'; RETURN;
  END IF;

  SELECT id, banned_at, is_shadowbanned INTO v_aff
    FROM public.profiles WHERE id = p_affiliate_id;
  IF v_aff IS NULL THEN
    RETURN QUERY SELECT FALSE, 'affiliate_not_found'; RETURN;
  END IF;
  IF v_aff.banned_at IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 'affiliate_banned'; RETURN;
  END IF;
  IF COALESCE(v_aff.is_shadowbanned, false) THEN
    RETURN QUERY SELECT FALSE, 'affiliate_shadowbanned'; RETURN;
  END IF;

  IF p_referred_user_id IS NOT NULL THEN
    SELECT id, banned_at INTO v_ref
      FROM public.profiles WHERE id = p_referred_user_id;
    IF v_ref.banned_at IS NOT NULL THEN
      RETURN QUERY SELECT FALSE, 'referred_banned'; RETURN;
    END IF;
  END IF;

  -- Fraude (tabela opcional)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='fraud_signals'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.fraud_signals
      WHERE user_id = p_affiliate_id
        AND severity IN ('high','critical')
    ) THEN
      RETURN QUERY SELECT FALSE, 'affiliate_fraud_flagged'; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, 'valid';
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_affiliate_link(UUID, UUID) TO authenticated, anon;

-- 4. Reescrever process_payment_split com validação condicional
CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id TEXT,
  p_payment_external_id TEXT,
  p_flow_type TEXT,
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
  v_cfg RECORD;
  v_tax_rate DECIMAL(5,4);
  v_platform_rate DECIMAL(5,4);
  v_affiliate_rate DECIMAL(5,4);
  v_tax DECIMAL(10,2);
  v_base DECIMAL(10,2);
  v_platform DECIMAL(10,2);
  v_affiliate DECIMAL(10,2) := 0;
  v_creator DECIMAL(10,2) := 0;
  v_result JSONB;
  v_aff_check RECORD;
  v_effective_affiliate UUID := NULL;
  v_rejection TEXT := NULL;
  v_referred UUID;
BEGIN
  -- Config ativa
  SELECT platform_percent, tax_percent, creator_percent, affiliate_percent
    INTO v_cfg
  FROM public.split_config WHERE is_active = true
  ORDER BY updated_at DESC LIMIT 1;

  IF v_cfg IS NULL THEN
    v_tax_rate := 0.06; v_platform_rate := 0.20; v_affiliate_rate := 0.05;
    v_cfg := ROW(20.00, 6.00, 69.00, 5.00)::RECORD;
  ELSE
    v_tax_rate := v_cfg.tax_percent / 100.0;
    v_platform_rate := v_cfg.platform_percent / 100.0;
    v_affiliate_rate := v_cfg.affiliate_percent / 100.0;
  END IF;

  -- Determinar referred (quem pagou): prioridade transactions.user_id
  SELECT user_id INTO v_referred
    FROM public.transactions
    WHERE id::text = p_transaction_id
       OR external_id = p_payment_external_id
    LIMIT 1;

  -- Validar afiliado
  IF p_affiliate_id IS NOT NULL THEN
    SELECT * INTO v_aff_check
      FROM public.validate_affiliate_link(v_referred, p_affiliate_id);
    IF v_aff_check.is_valid THEN
      v_effective_affiliate := p_affiliate_id;
    ELSE
      v_rejection := v_aff_check.reason;
    END IF;
  ELSE
    v_rejection := 'no_affiliate';
  END IF;

  -- Imposto sobre o bruto
  v_tax  := ROUND(p_gross_amount * v_tax_rate, 2);
  v_base := ROUND(p_gross_amount - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    IF v_effective_affiliate IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform  := ROUND(v_base - v_affiliate, 2);
    ELSE
      v_platform  := v_base;
    END IF;
    v_creator := 0;

  ELSIF p_flow_type = 'creator_content' THEN
    v_platform := ROUND(v_base * v_platform_rate, 2);
    IF v_effective_affiliate IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;
    -- Sem afiliado válido: criador absorve a fatia (74% do líquido)
    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);

  ELSE
    v_platform := 0; v_creator := 0; v_affiliate := 0;
  END IF;

  -- Creditar criador
  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance,0) + v_creator
      WHERE id = p_creator_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Creditar afiliado
  IF v_affiliate > 0 AND v_effective_affiliate IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance,0) + v_affiliate
      WHERE id = v_effective_affiliate;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (v_effective_affiliate, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Atualizar transactions.affiliate_id (transparência)
  IF v_effective_affiliate IS NOT NULL THEN
    UPDATE public.transactions
      SET affiliate_id = v_effective_affiliate
      WHERE id::text = p_transaction_id OR external_id = p_payment_external_id;
  END IF;

  -- Auditoria
  INSERT INTO public.affiliate_split_audit (
    transaction_id, payment_external_id, referred_user_id,
    affiliate_id_input, affiliate_id_applied,
    is_valid, rejection_reason,
    affiliate_amount, creator_amount
  ) VALUES (
    p_transaction_id, p_payment_external_id, v_referred,
    p_affiliate_id, v_effective_affiliate,
    v_effective_affiliate IS NOT NULL,
    v_rejection,
    v_affiliate, v_creator
  );

  -- Log existente em transaction_split_logs
  INSERT INTO public.transaction_split_logs (
    transaction_id, payment_external_id, flow_type,
    gross_amount, tax_amount, tax_rate, base_amount,
    platform_amount, platform_rate,
    affiliate_amount, affiliate_rate,
    creator_amount, creator_id, affiliate_id, provider
  ) VALUES (
    p_transaction_id, p_payment_external_id, p_flow_type,
    p_gross_amount, v_tax, v_tax_rate, v_base,
    v_platform, CASE WHEN p_flow_type='platform_plan' THEN 1.00 - v_affiliate_rate ELSE v_platform_rate END,
    v_affiliate, v_affiliate_rate,
    v_creator, p_creator_id, v_effective_affiliate, p_provider
  );

  v_result := jsonb_build_object(
    'gross', p_gross_amount,
    'tax', v_tax,
    'base', v_base,
    'platform', v_platform,
    'affiliate', v_affiliate,
    'creator', v_creator,
    'flow_type', p_flow_type,
    'affiliate_applied', v_effective_affiliate IS NOT NULL,
    'affiliate_id', v_effective_affiliate,
    'rejection_reason', v_rejection,
    'config', jsonb_build_object(
      'tax_pct', v_cfg.tax_percent,
      'platform_pct', v_cfg.platform_percent,
      'creator_pct', v_cfg.creator_percent,
      'affiliate_pct', v_cfg.affiliate_percent
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payment_split(TEXT,TEXT,TEXT,DECIMAL,UUID,UUID,TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
