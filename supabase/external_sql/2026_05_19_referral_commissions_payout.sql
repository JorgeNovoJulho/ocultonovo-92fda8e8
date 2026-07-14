-- =====================================================================
-- 2026-05-19 — Comissões de Indicação: SAQUE PARCIAL + saldo acumulado
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- Tabelas usadas: creator_referrals, referral_ledger, referral_withdrawals,
--                 referral_program_config
-- =====================================================================

-- Regras: mínimo R$ 250 por saque, até 4 saques/mês
UPDATE public.referral_program_config
SET
  withdraw_min_amount = 250.00,
  withdraw_monthly_limit = 4,
  updated_at = now()
WHERE id = true;

-- Saldo disponível para saque do afiliado logado
-- = SUM(creator_referrals.total_commission_earned do madrinha)
--   - SUM(referral_withdrawals.amount com status in pending/paid)
CREATE OR REPLACE FUNCTION public.referral_balance_self()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_earned numeric(12,2) := 0;
  v_withdrawn numeric(12,2) := 0;
  v_available numeric(12,2) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  SELECT COALESCE(SUM(cr.total_commission_earned), 0)
    INTO v_earned
  FROM public.creator_referrals cr
  WHERE cr.madrinha_id = v_profile_id;

  SELECT COALESCE(SUM(rw.amount), 0)
    INTO v_withdrawn
  FROM public.referral_withdrawals rw
  WHERE rw.user_id = v_uid
    AND rw.status IN ('pending', 'processing', 'paid');

  v_available := GREATEST(v_earned - v_withdrawn, 0);

  RETURN jsonb_build_object(
    'ok', true,
    'earned_total', v_earned,
    'withdrawn_total', v_withdrawn,
    'available', v_available
  );
END;
$$;

REVOKE ALL ON FUNCTION public.referral_balance_self() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_balance_self() TO authenticated;

-- Saque parcial: usuário define o valor (>= 250) até o saldo disponível
DROP FUNCTION IF EXISTS public.request_referral_commission_withdrawal(text);
DROP FUNCTION IF EXISTS public.request_referral_commission_withdrawal(numeric, text);

CREATE OR REPLACE FUNCTION public.request_referral_commission_withdrawal(
  p_amount numeric,
  p_pix_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_cfg public.referral_program_config%ROWTYPE;
  v_earned numeric(12,2) := 0;
  v_withdrawn numeric(12,2) := 0;
  v_available numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_month_start timestamptz := date_trunc('month', now());
  v_month_count int := 0;
  v_withdrawal_id uuid;
  v_pix_key text;
  v_pix_key_type text;
  v_remaining numeric(12,2);
  v_ledger_row record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  SELECT * INTO v_cfg FROM public.referral_program_config WHERE id = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'config_not_found');
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);

  IF v_amount < COALESCE(v_cfg.withdraw_min_amount, 250) THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'below_minimum',
      'min_amount', COALESCE(v_cfg.withdraw_min_amount, 250)
    );
  END IF;

  -- saldo disponível
  SELECT COALESCE(SUM(cr.total_commission_earned), 0)
    INTO v_earned
  FROM public.creator_referrals cr
  WHERE cr.madrinha_id = v_profile_id;

  SELECT COALESCE(SUM(rw.amount), 0)
    INTO v_withdrawn
  FROM public.referral_withdrawals rw
  WHERE rw.user_id = v_uid
    AND rw.status IN ('pending', 'processing', 'paid');

  v_available := GREATEST(v_earned - v_withdrawn, 0);

  IF v_amount > v_available THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'amount_exceeds_balance',
      'available', v_available, 'requested', v_amount
    );
  END IF;

  -- limite mensal
  SELECT COUNT(*) INTO v_month_count
  FROM public.referral_withdrawals rw
  WHERE rw.user_id = v_uid
    AND rw.requested_at >= v_month_start;

  IF v_month_count >= COALESCE(v_cfg.withdraw_monthly_limit, 4) THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'monthly_limit_reached',
      'limit', COALESCE(v_cfg.withdraw_monthly_limit, 4),
      'used', v_month_count
    );
  END IF;

  -- chave PIX (prioriza param, senão a do perfil)
  SELECT
    COALESCE(NULLIF(trim(p_pix_key), ''), NULLIF(trim(p.pix_key), '')),
    COALESCE(NULLIF(trim(p.pix_key_type), ''), 'random')
  INTO v_pix_key, v_pix_key_type
  FROM public.profiles p
  WHERE p.user_id = v_uid
  LIMIT 1;

  IF v_pix_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pix_key_missing');
  END IF;

  INSERT INTO public.referral_withdrawals (
    user_id, amount, pix_key, pix_key_type, status, metadata
  ) VALUES (
    v_uid, v_amount, v_pix_key, v_pix_key_type, 'pending',
    jsonb_build_object(
      'source', 'referral_commission',
      'available_before', v_available,
      'remainder_after', v_available - v_amount
    )
  )
  RETURNING id INTO v_withdrawal_id;

  -- marca entradas confirmed do ledger como pagas até cobrir o valor (FIFO)
  v_remaining := v_amount;
  FOR v_ledger_row IN
    SELECT id, commission_amount
    FROM public.referral_ledger
    WHERE affiliate_id = v_uid AND status = 'confirmed'
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    UPDATE public.referral_ledger
    SET status = 'paid',
        paid_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('withdrawal_id', v_withdrawal_id)
    WHERE id = v_ledger_row.id;
    v_remaining := v_remaining - COALESCE(v_ledger_row.commission_amount, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_withdrawal_id,
    'amount', v_amount,
    'available_after', v_available - v_amount,
    'monthly_used', v_month_count + 1,
    'monthly_limit', COALESCE(v_cfg.withdraw_monthly_limit, 4)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_referral_commission_withdrawal(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_referral_commission_withdrawal(numeric, text) TO authenticated;
