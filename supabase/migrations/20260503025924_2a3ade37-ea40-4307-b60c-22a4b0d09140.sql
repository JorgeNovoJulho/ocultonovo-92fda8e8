
-- ===== Tabela de auditoria de bloqueios =====
CREATE TABLE IF NOT EXISTS public.oculto_blocked_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID,
  referred_id UUID,
  subscription_id UUID,
  gross_amount NUMERIC(10,2),
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_blocked_comm_referrer ON public.oculto_blocked_commissions(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_comm_reason ON public.oculto_blocked_commissions(reason);

ALTER TABLE public.oculto_blocked_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Block direct access blocked_commissions" ON public.oculto_blocked_commissions;
CREATE POLICY "Block direct access blocked_commissions"
  ON public.oculto_blocked_commissions AS RESTRICTIVE FOR ALL
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Admins read blocked_commissions" ON public.oculto_blocked_commissions;
CREATE POLICY "Admins read blocked_commissions"
  ON public.oculto_blocked_commissions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== Verificador de fraude =====
CREATE OR REPLACE FUNCTION public.check_referral_fraud(
  p_referrer_id UUID, p_referred_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_shared_ip TEXT;
  v_shared_device TEXT;
  v_reason TEXT := NULL;
BEGIN
  IF p_referrer_id = p_referred_id THEN
    RETURN jsonb_build_object('suspicious', true, 'reason', 'self_referral');
  END IF;

  -- IP em comum nos últimos 30 dias
  SELECT a.ip_address INTO v_shared_ip
  FROM public.oculto_user_activity_logs a
  JOIN public.oculto_user_activity_logs b
    ON a.ip_address = b.ip_address AND a.ip_address IS NOT NULL
  WHERE a.user_id = p_referrer_id AND b.user_id = p_referred_id
    AND a.created_at > now() - INTERVAL '30 days'
    AND b.created_at > now() - INTERVAL '30 days'
  LIMIT 1;

  IF v_shared_ip IS NOT NULL THEN v_reason := 'shared_ip'; END IF;

  -- Device em comum
  SELECT a.device_id INTO v_shared_device
  FROM public.oculto_user_activity_logs a
  JOIN public.oculto_user_activity_logs b
    ON a.device_id = b.device_id AND a.device_id IS NOT NULL
  WHERE a.user_id = p_referrer_id AND b.user_id = p_referred_id
    AND a.created_at > now() - INTERVAL '30 days'
    AND b.created_at > now() - INTERVAL '30 days'
  LIMIT 1;

  IF v_shared_device IS NOT NULL THEN
    v_reason := COALESCE(v_reason || '+', '') || 'shared_device';
  END IF;

  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('suspicious', false);
  END IF;

  RETURN jsonb_build_object(
    'suspicious', true,
    'reason', v_reason,
    'shared_ip', v_shared_ip,
    'shared_device', v_shared_device
  );
END $$;

GRANT EXECUTE ON FUNCTION public.check_referral_fraud(UUID,UUID) TO authenticated;

-- ===== Patch em record_referral_subscription_commission =====
CREATE OR REPLACE FUNCTION public.record_referral_subscription_commission(
  p_referred_user_id uuid, p_subscription_id uuid,
  p_gross_amount numeric, p_is_recurring boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral_user RECORD;
  v_affiliate RECORD;
  v_commission_amount NUMERIC;
  v_current_affiliate_id UUID;
  v_current_level INTEGER := 1;
  v_level_rate NUMERIC;
  v_inserted_count INTEGER := 0;
  v_fraud JSONB;
BEGIN
  SELECT * INTO v_referral_user
  FROM public.referral_users
  WHERE referred_user_id = p_referred_user_id LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'commissions', 0, 'reason', 'no_referral');
  END IF;

  -- ANTI-FRAUDE: bloqueia se referrer e referido compartilham IP/device
  IF v_referral_user.affiliate_id IS NOT NULL THEN
    SELECT public.check_referral_fraud(
      (SELECT user_id FROM public.referral_affiliates WHERE id = v_referral_user.affiliate_id),
      p_referred_user_id
    ) INTO v_fraud;

    IF (v_fraud->>'suspicious')::boolean THEN
      INSERT INTO public.oculto_blocked_commissions(
        referrer_id, referred_id, subscription_id, gross_amount, reason, evidence
      ) VALUES (
        (SELECT user_id FROM public.referral_affiliates WHERE id = v_referral_user.affiliate_id),
        p_referred_user_id, p_subscription_id, p_gross_amount,
        v_fraud->>'reason', v_fraud
      );
      RETURN jsonb_build_object('success', false, 'commissions', 0,
        'reason', 'fraud_detected', 'detail', v_fraud);
    END IF;
  END IF;

  UPDATE public.referral_users
  SET lifetime_value = lifetime_value + p_gross_amount,
      last_purchase_at = now(),
      first_purchase_at = COALESCE(first_purchase_at, now()),
      status = 'converted'
  WHERE id = v_referral_user.id;

  v_current_affiliate_id := v_referral_user.affiliate_id;

  WHILE v_current_affiliate_id IS NOT NULL LOOP
    SELECT a.*, p.max_levels, p.level_rates AS prog_level_rates,
           p.commission_rate AS prog_commission_rate
    INTO v_affiliate
    FROM public.referral_affiliates a
    JOIN public.referral_programs p ON a.program_id = p.id
    WHERE a.id = v_current_affiliate_id;

    EXIT WHEN NOT FOUND OR v_current_level > COALESCE(v_affiliate.max_levels, 1);

    v_level_rate := COALESCE(
      (v_affiliate.prog_level_rates->>(v_current_level-1)::text)::numeric,
      v_affiliate.prog_commission_rate, 5
    );
    v_commission_amount := ROUND(p_gross_amount * v_level_rate / 100, 2);

    INSERT INTO public.referral_commissions(
      affiliate_id, referred_user_id, subscription_id,
      gross_amount, commission_amount, commission_rate,
      level, is_recurring, status
    ) VALUES (
      v_current_affiliate_id, p_referred_user_id, p_subscription_id,
      p_gross_amount, v_commission_amount, v_level_rate,
      v_current_level, p_is_recurring, 'pending'
    );

    UPDATE public.referral_affiliates
    SET pending_commission = COALESCE(pending_commission,0) + v_commission_amount,
        total_revenue = COALESCE(total_revenue,0) + p_gross_amount
    WHERE id = v_current_affiliate_id;

    v_inserted_count := v_inserted_count + 1;
    v_current_affiliate_id := v_affiliate.parent_affiliate_id;
    v_current_level := v_current_level + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'commissions', v_inserted_count);
END $$;
