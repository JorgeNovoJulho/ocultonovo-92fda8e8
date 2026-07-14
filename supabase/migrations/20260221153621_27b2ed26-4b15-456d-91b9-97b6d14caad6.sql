
-- Refactor purchase_media to use correct 74/20/6 split and credit creator balance
CREATE OR REPLACE FUNCTION public.purchase_media(
  p_buyer_id uuid,
  p_post_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id uuid;
  v_price numeric(10,2);
  v_is_paid boolean;
  v_already_purchased boolean;
  v_platform_fee numeric(10,2);
  v_tax_fee numeric(10,2);
  v_seller_amount numeric(10,2);
  v_buyer_balance numeric;
BEGIN
  -- Get post info
  SELECT user_id, is_paid, paid_price 
  INTO v_seller_id, v_is_paid, v_price
  FROM posts WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post não encontrado');
  END IF;

  IF NOT v_is_paid OR v_price IS NULL OR v_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este conteúdo não é pago');
  END IF;

  IF p_buyer_id = v_seller_id THEN
    RETURN jsonb_build_object('success', true, 'already_purchased', true);
  END IF;

  -- Check if already purchased
  SELECT EXISTS(
    SELECT 1 FROM media_access WHERE user_id = p_buyer_id AND post_id = p_post_id
  ) INTO v_already_purchased;

  IF v_already_purchased THEN
    RETURN jsonb_build_object('success', true, 'already_purchased', true);
  END IF;

  -- Check buyer balance
  SELECT COALESCE(balance, 0) INTO v_buyer_balance FROM profiles WHERE id = p_buyer_id;
  IF v_buyer_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente. Recarregue sua carteira.');
  END IF;

  -- Calculate fees: 74% creator / 20% platform / 6% tax
  v_platform_fee := ROUND(v_price * 0.20, 2);
  v_tax_fee := ROUND(v_price * 0.06, 2);
  v_seller_amount := v_price - v_platform_fee - v_tax_fee;

  -- Deduct buyer balance
  UPDATE profiles SET balance = balance - v_price WHERE id = p_buyer_id;

  -- Credit seller balance
  UPDATE profiles SET balance = balance + v_seller_amount WHERE id = v_seller_id;

  -- Insert access record
  INSERT INTO media_access (user_id, post_id, seller_id, amount_paid)
  VALUES (p_buyer_id, p_post_id, v_seller_id, v_price);

  -- Record transaction for seller (credit)
  INSERT INTO transactions (user_id, seller_id, amount, type, description, status)
  VALUES (
    v_seller_id,
    v_seller_id,
    v_seller_amount,
    'content_sale',
    'Venda de conteúdo pago (74%)',
    'completed'
  );

  -- Record platform fee transaction
  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (
    p_buyer_id,
    v_platform_fee,
    'platform_fee',
    'Comissão da plataforma (20%)',
    'completed'
  );

  -- Record tax reservation transaction
  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (
    p_buyer_id,
    v_tax_fee,
    'platform_fee',
    'Reserva tributária (6%)',
    'completed'
  );

  -- Record buyer debit
  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (
    p_buyer_id,
    -v_price,
    'content_purchase',
    format('Compra de conteúdo - Post %s', p_post_id),
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount_paid', v_price,
    'seller_amount', v_seller_amount,
    'platform_fee', v_platform_fee,
    'tax_fee', v_tax_fee,
    'already_purchased', false
  );
END;
$$;

-- Ensure profiles table is in realtime publication for balance updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
