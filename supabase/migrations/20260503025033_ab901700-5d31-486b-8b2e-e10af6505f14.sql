-- ════════════════════════════════════════════════════════════
-- Afiliados: Comissão Recorrente sobre Assinaturas
-- Não duplica process_payment_split (que credita saldo).
-- Esta função apenas REGISTRA o rastro analítico em referral_commissions.
-- ════════════════════════════════════════════════════════════

-- 1. Coluna para distinguir primeira compra vs renovação
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;

-- 2. Índice de relatórios
CREATE INDEX IF NOT EXISTS idx_referral_commissions_affiliate_period
  ON public.referral_commissions(affiliate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_recurring
  ON public.referral_commissions(is_recurring, status);

-- 3. RLS: bloquear escrita direta via SDK (só SECURITY DEFINER pode inserir)
DROP POLICY IF EXISTS "System can insert commissions" ON public.referral_commissions;
DROP POLICY IF EXISTS "Anyone can insert commissions" ON public.referral_commissions;

CREATE POLICY "Block direct writes to referral_commissions"
ON public.referral_commissions AS RESTRICTIVE FOR INSERT
WITH CHECK (false);

-- 4. RPC unificada: registra comissão de assinatura (1ª venda OU renovação)
CREATE OR REPLACE FUNCTION public.record_referral_subscription_commission(
  p_referred_user_id UUID,
  p_subscription_id UUID,
  p_gross_amount NUMERIC,
  p_is_recurring BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_user RECORD;
  v_affiliate RECORD;
  v_commission_amount NUMERIC;
  v_current_affiliate_id UUID;
  v_current_level INTEGER := 1;
  v_level_rate NUMERIC;
  v_inserted_count INTEGER := 0;
BEGIN
  -- Buscar usuário referido (rastreamento)
  SELECT * INTO v_referral_user
  FROM public.referral_users
  WHERE referred_user_id = p_referred_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'commissions', 0, 'reason', 'no_referral');
  END IF;

  -- Atualiza LTV e marca como convertido (só na primeira)
  UPDATE public.referral_users
  SET lifetime_value = lifetime_value + p_gross_amount,
      last_purchase_at = now(),
      first_purchase_at = COALESCE(first_purchase_at, now()),
      status = 'converted'
  WHERE id = v_referral_user.id;

  v_current_affiliate_id := v_referral_user.affiliate_id;

  -- Multi-nível
  WHILE v_current_affiliate_id IS NOT NULL LOOP
    SELECT a.*, p.max_levels, p.level_rates AS prog_level_rates,
           p.commission_rate AS prog_commission_rate
    INTO v_affiliate
    FROM public.referral_affiliates a
    JOIN public.referral_programs p ON a.program_id = p.id
    WHERE a.id = v_current_affiliate_id AND a.status = 'active';

    IF NOT FOUND OR v_current_level > COALESCE(v_affiliate.max_levels, 1) THEN
      EXIT;
    END IF;

    v_level_rate := COALESCE(
      (v_affiliate.level_rates->>(v_current_level - 1))::NUMERIC,
      v_affiliate.commission_rate,
      5.0
    );

    v_commission_amount := ROUND(p_gross_amount * (v_level_rate / 100), 2);

    -- Registrar comissão (rastro analítico — saldo é creditado por process_payment_split)
    INSERT INTO public.referral_commissions (
      affiliate_id, referral_user_id, source_type, source_id,
      source_amount, commission_rate, commission_amount, level,
      status, is_recurring
    ) VALUES (
      v_current_affiliate_id, v_referral_user.id, 'subscription', p_subscription_id,
      p_gross_amount, v_level_rate, v_commission_amount, v_current_level,
      'pending', p_is_recurring
    );

    v_inserted_count := v_inserted_count + 1;

    -- Atualizar estatísticas do afiliado
    UPDATE public.referral_affiliates
    SET total_revenue_generated = total_revenue_generated + p_gross_amount,
        total_commission_earned = total_commission_earned + v_commission_amount,
        pending_commission = pending_commission + v_commission_amount,
        total_conversions = CASE WHEN p_is_recurring THEN total_conversions
                                 ELSE total_conversions + 1 END,
        updated_at = now()
    WHERE id = v_current_affiliate_id;

    IF v_current_level = 1 AND NOT p_is_recurring THEN
      UPDATE public.referral_users
      SET commission_generated = commission_generated + v_commission_amount
      WHERE id = v_referral_user.id;
    END IF;

    -- Próximo nível
    SELECT parent_affiliate_id INTO v_current_affiliate_id
    FROM public.referral_affiliates WHERE id = v_current_affiliate_id;

    v_current_level := v_current_level + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'commissions_recorded', v_inserted_count,
    'is_recurring', p_is_recurring
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_referral_subscription_commission(UUID, UUID, NUMERIC, BOOLEAN) TO authenticated, service_role;