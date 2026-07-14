-- =====================================================================
-- Creator Coupons system (idempotente)
-- Tabelas: oculto_creator_coupons, oculto_coupon_redemptions
-- RPCs: redeem_coupon, creator_coupon_analytics
-- Também adiciona colunas promocionais em posts.
-- =====================================================================

-- 1) Colunas de promoção em posts ---------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_promo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_price decimal(10,2),
  ADD COLUMN IF NOT EXISTS promo_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS promo_ends_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_posts_is_promo ON public.posts (is_promo) WHERE is_promo = true;

-- 2) Tabela de cupons ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_creator_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  code text NOT NULL,
  discount_percent int NOT NULL CHECK (discount_percent BETWEEN 1 AND 90),
  applies_to text[] NOT NULL DEFAULT '{}',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  uses_count int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  posted_to_feed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_coupons_code
  ON public.oculto_creator_coupons (creator_id, lower(code));
CREATE INDEX IF NOT EXISTS idx_creator_coupons_creator ON public.oculto_creator_coupons (creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_coupons_active ON public.oculto_creator_coupons (is_active, valid_until);

-- 3) Tabela de redenções ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.oculto_creator_coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  amount_discounted decimal(10,2) NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupon_redemption_one_per_user
  ON public.oculto_coupon_redemptions (coupon_id, user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON public.oculto_coupon_redemptions (coupon_id, redeemed_at DESC);

-- 4) updated_at trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_creator_coupons_updated_at ON public.oculto_creator_coupons;
CREATE TRIGGER trg_creator_coupons_updated_at
  BEFORE UPDATE ON public.oculto_creator_coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5) RLS ----------------------------------------------------------------
ALTER TABLE public.oculto_creator_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_coupons_select_public" ON public.oculto_creator_coupons;
CREATE POLICY "creator_coupons_select_public"
  ON public.oculto_creator_coupons FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "creator_coupons_owner_write" ON public.oculto_creator_coupons;
CREATE POLICY "creator_coupons_owner_write"
  ON public.oculto_creator_coupons FOR ALL
  USING (creator_id = auth.uid())
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "coupon_redemptions_select_owner_or_self" ON public.oculto_coupon_redemptions;
CREATE POLICY "coupon_redemptions_select_owner_or_self"
  ON public.oculto_coupon_redemptions FOR SELECT
  USING (
    user_id = auth.uid()
    OR coupon_id IN (SELECT id FROM public.oculto_creator_coupons WHERE creator_id = auth.uid())
  );

-- inserts via RPC apenas (security definer)

-- 6) RPC: redeem_coupon -------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_code text,
  p_creator uuid,
  p_target_type text,
  p_target_id uuid,
  p_amount decimal
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_coupon public.oculto_creator_coupons%ROWTYPE;
  v_discount decimal(10,2);
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_coupon
    FROM public.oculto_creator_coupons
   WHERE creator_id = p_creator AND lower(code) = lower(p_code)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  IF now() < v_coupon.valid_from OR now() > v_coupon.valid_until THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF v_coupon.uses_count >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'sold_out');
  END IF;

  IF array_length(v_coupon.applies_to, 1) IS NOT NULL
     AND NOT (p_target_type = ANY (v_coupon.applies_to)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_applicable');
  END IF;

  IF EXISTS (SELECT 1 FROM public.oculto_coupon_redemptions
              WHERE coupon_id = v_coupon.id AND user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;

  v_discount := round((coalesce(p_amount, 0) * v_coupon.discount_percent / 100.0)::numeric, 2);

  INSERT INTO public.oculto_coupon_redemptions (coupon_id, user_id, target_type, target_id, amount_discounted)
  VALUES (v_coupon.id, v_user, p_target_type, p_target_id, v_discount);

  UPDATE public.oculto_creator_coupons
     SET uses_count = uses_count + 1
   WHERE id = v_coupon.id;

  RETURN jsonb_build_object(
    'ok', true,
    'discount_percent', v_coupon.discount_percent,
    'amount_discounted', v_discount,
    'coupon_id', v_coupon.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, uuid, text, uuid, decimal) TO authenticated;

-- 7) RPC: creator_coupon_analytics --------------------------------------
CREATE OR REPLACE FUNCTION public.creator_coupon_analytics(p_creator uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_data jsonb;
BEGIN
  IF v_user IS NULL OR v_user <> p_creator THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'total_redemptions', coalesce(sum(rcount),0),
    'total_discounted', coalesce(sum(samount),0),
    'by_day', jsonb_agg(jsonb_build_object('day', day, 'count', rcount, 'amount', samount) ORDER BY day),
    'by_type', (
      SELECT jsonb_object_agg(target_type, c)
        FROM (
          SELECT target_type, count(*)::int AS c
            FROM public.oculto_coupon_redemptions r
            JOIN public.oculto_creator_coupons c2 ON c2.id = r.coupon_id
           WHERE c2.creator_id = p_creator
           GROUP BY target_type
        ) t
    )
  )
  INTO v_data
  FROM (
    SELECT date_trunc('day', r.redeemed_at)::date AS day,
           count(*)::int AS rcount,
           coalesce(sum(r.amount_discounted),0)::decimal(10,2) AS samount
      FROM public.oculto_coupon_redemptions r
      JOIN public.oculto_creator_coupons c ON c.id = r.coupon_id
     WHERE c.creator_id = p_creator
       AND r.redeemed_at > now() - interval '90 days'
     GROUP BY 1
     ORDER BY 1
  ) g;

  RETURN coalesce(v_data, jsonb_build_object('ok', true, 'total_redemptions', 0, 'total_discounted', 0, 'by_day', '[]'::jsonb, 'by_type', '{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.creator_coupon_analytics(uuid) TO authenticated;
