-- =====================================================================
-- PAID CONTENT — ASAAS CHECKOUT (idempotente)
-- 2026-05-07 — adiciona campos em transactions, validador de afiliado,
-- e RPC release_paid_content_access (chamada APENAS pelo webhook).
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Campos extras em transactions ------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS post_id           uuid,
  ADD COLUMN IF NOT EXISTS affiliate_source  text,    -- link | manual | none
  ADD COLUMN IF NOT EXISTS affiliate_applied boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_post_id
  ON public.transactions (post_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id
  ON public.transactions (seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id
  ON public.transactions (external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status_type
  ON public.transactions (status, type);

-- 2) Validador de afiliado --------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_affiliate_for_purchase(
  p_buyer_id     uuid,
  p_creator_id   uuid,
  p_affiliate_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_exists  boolean;
  v_blocked boolean;
BEGIN
  IF p_affiliate_id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'no_affiliate');
  END IF;

  IF p_affiliate_id = p_buyer_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'self_referral');
  END IF;

  IF p_affiliate_id = p_creator_id THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'creator_is_affiliate');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = p_affiliate_id)
    INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  SELECT COALESCE(is_banned, false) OR COALESCE(risk_level = 'high', false)
    INTO v_blocked
  FROM public.profiles
  WHERE id = p_affiliate_id;

  IF v_blocked THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'blocked_or_risk');
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_affiliate_for_purchase(uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3) Lookup de afiliado por @username (frontend) ----------------------
CREATE OR REPLACE FUNCTION public.lookup_affiliate_by_username(
  p_username text
) RETURNS TABLE (id uuid, username text, name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, username, name, avatar_url
    FROM public.profiles
   WHERE lower(username) = lower(trim(both '@' from coalesce(p_username,'')))
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_affiliate_by_username(text)
  TO authenticated, anon;

-- 4) Release de conteúdo (chamado SOMENTE pelo webhook) ---------------
CREATE OR REPLACE FUNCTION public.release_paid_content_access(
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tx    public.transactions%ROWTYPE;
  v_post_id uuid;
  v_buyer  uuid;
  v_seller uuid;
  v_amount numeric(10,2);
  v_access_id uuid;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'tx_not_found');
  END IF;

  v_post_id := v_tx.post_id;
  v_buyer   := v_tx.user_id;
  v_seller  := v_tx.seller_id;
  v_amount  := COALESCE(v_tx.amount, 0);

  IF v_post_id IS NULL OR v_buyer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_refs');
  END IF;

  INSERT INTO public.media_access (user_id, post_id, seller_id, amount_paid, purchased_at)
  VALUES (v_buyer, v_post_id, v_seller, v_amount, now())
  ON CONFLICT (user_id, post_id) DO UPDATE
    SET amount_paid = EXCLUDED.amount_paid
  RETURNING id INTO v_access_id;

  RETURN jsonb_build_object(
    'success', true, 'access_id', v_access_id,
    'post_id', v_post_id, 'buyer_id', v_buyer
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_paid_content_access(uuid) TO service_role;
