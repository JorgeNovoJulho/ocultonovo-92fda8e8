-- Add paid content columns to posts
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS is_paid boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS paid_price numeric(10,2) DEFAULT 0;

-- Create media_access table for tracking purchases
CREATE TABLE IF NOT EXISTS public.media_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.media_access ENABLE ROW LEVEL SECURITY;

-- Users can see their own purchases
CREATE POLICY "Users can view own purchases"
ON public.media_access FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own purchases
CREATE POLICY "Users can purchase media"
ON public.media_access FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Sellers can view sales of their content
CREATE POLICY "Sellers can view sales"
ON public.media_access FOR SELECT
USING (auth.uid() = seller_id);

-- Function to check if user has access to paid media
CREATE OR REPLACE FUNCTION public.check_media_access(p_user_id uuid, p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
  post_owner uuid;
BEGIN
  -- Check if user is the post owner
  SELECT user_id INTO post_owner FROM posts WHERE id = p_post_id;
  IF post_owner = p_user_id THEN
    RETURN true;
  END IF;

  -- Check if user purchased this content
  SELECT EXISTS(
    SELECT 1 FROM media_access 
    WHERE user_id = p_user_id AND post_id = p_post_id
  ) INTO has_access;

  RETURN has_access;
END;
$$;

-- Function to purchase media and credit seller
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
  v_seller_amount numeric(10,2);
BEGIN
  -- Get post info
  SELECT user_id, is_paid, paid_price 
  INTO v_seller_id, v_is_paid, v_price
  FROM posts WHERE id = p_post_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post não encontrado');
  END IF;

  IF NOT v_is_paid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Este conteúdo não é pago');
  END IF;

  -- Check if already purchased
  SELECT EXISTS(
    SELECT 1 FROM media_access WHERE user_id = p_buyer_id AND post_id = p_post_id
  ) INTO v_already_purchased;

  IF v_already_purchased THEN
    RETURN jsonb_build_object('success', true, 'already_purchased', true);
  END IF;

  -- Calculate fees (20% platform)
  v_platform_fee := v_price * 0.20;
  v_seller_amount := v_price - v_platform_fee;

  -- Insert access record
  INSERT INTO media_access (user_id, post_id, seller_id, amount_paid)
  VALUES (p_buyer_id, p_post_id, v_seller_id, v_price);

  -- Record transaction for seller
  INSERT INTO transactions (user_id, seller_id, amount, type, description, status)
  VALUES (
    p_buyer_id,
    v_seller_id,
    v_seller_amount,
    'content_sale',
    'Venda de conteúdo pago',
    'completed'
  );

  -- Record platform fee transaction
  INSERT INTO transactions (user_id, amount, type, description, status)
  VALUES (
    p_buyer_id,
    v_platform_fee,
    'platform_fee',
    'Taxa da plataforma (20%)',
    'completed'
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount_paid', v_price,
    'seller_amount', v_seller_amount,
    'platform_fee', v_platform_fee
  );
END;
$$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_media_access_user_post ON public.media_access(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_media_access_seller ON public.media_access(seller_id);
CREATE INDEX IF NOT EXISTS idx_posts_is_paid ON public.posts(is_paid) WHERE is_paid = true;

-- Enable realtime for media_access
ALTER PUBLICATION supabase_realtime ADD TABLE public.media_access;
