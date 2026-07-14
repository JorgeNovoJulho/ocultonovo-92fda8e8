
ALTER TABLE public.oculto_blocked_commissions
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','suspicious','cleared')),
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_blocked_comm_status
  ON public.oculto_blocked_commissions(review_status, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspicious_flagged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspicious_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspicious_flag_reason TEXT;

-- ===== List blocked commissions (admin) =====
CREATE OR REPLACE FUNCTION public.list_blocked_commissions(
  p_status TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_ip TEXT DEFAULT NULL,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID, referrer_id UUID, referred_id UUID,
  subscription_id UUID, gross_amount NUMERIC,
  reason TEXT, evidence JSONB,
  review_status TEXT, review_note TEXT,
  reviewed_by UUID, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT b.id, b.referrer_id, b.referred_id, b.subscription_id, b.gross_amount,
         b.reason, b.evidence, b.review_status, b.review_note,
         b.reviewed_by, b.reviewed_at, b.created_at
  FROM public.oculto_blocked_commissions b
  WHERE b.created_at > now() - (p_days || ' days')::interval
    AND (p_status IS NULL OR b.review_status = p_status)
    AND (p_reason IS NULL OR b.reason ILIKE '%' || p_reason || '%')
    AND (p_ip IS NULL OR b.evidence->>'shared_ip' = p_ip)
  ORDER BY b.created_at DESC
  LIMIT p_limit;
END $$;

-- ===== Admin: marca como suspeita ou liberada =====
CREATE OR REPLACE FUNCTION public.update_commission_review(
  p_block_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_block RECORD;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  IF p_status NOT IN ('pending','suspicious','cleared') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.oculto_blocked_commissions
  SET review_status = p_status,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_block_id
  RETURNING * INTO v_block;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  -- Atualiza flag no perfil do referrer
  IF v_block.referrer_id IS NOT NULL THEN
    IF p_status = 'suspicious' THEN
      UPDATE public.profiles
      SET is_suspicious_flagged = true,
          suspicious_flagged_at = now(),
          suspicious_flag_reason = COALESCE(p_note, v_block.reason)
      WHERE id = v_block.referrer_id OR user_id = v_block.referrer_id;
    ELSIF p_status = 'cleared' THEN
      UPDATE public.profiles
      SET is_suspicious_flagged = false,
          suspicious_flag_reason = NULL
      WHERE id = v_block.referrer_id OR user_id = v_block.referrer_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'block', row_to_json(v_block));
END $$;

-- ===== Validação no checkout =====
-- Recebe o usuário comprando e checa se há referral marcando-o e se há
-- compartilhamento de IP/device com o referrer.
CREATE OR REPLACE FUNCTION public.validate_checkout_fraud(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referrer_user UUID;
  v_fraud JSONB;
BEGIN
  -- Busca affiliate do referido
  SELECT a.user_id INTO v_referrer_user
  FROM public.referral_users ru
  JOIN public.referral_affiliates a ON a.id = ru.affiliate_id
  WHERE ru.referred_user_id = p_user_id
  LIMIT 1;

  IF v_referrer_user IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  v_fraud := public.check_referral_fraud(v_referrer_user, p_user_id);

  IF (v_fraud->>'suspicious')::boolean THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', v_fraud->>'reason',
      'message', 'Detectamos atividade suspeita relacionada a esta assinatura. Entre em contato com o suporte.'
    );
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;

GRANT EXECUTE ON FUNCTION public.list_blocked_commissions(TEXT,TEXT,TEXT,INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_commission_review(UUID,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_checkout_fraud(UUID) TO authenticated;
