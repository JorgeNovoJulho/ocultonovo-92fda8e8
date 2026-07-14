
-- Add affiliate_id column to transactions (nullable, for tracking referral splits)
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Drop and recreate the view with correct split math:
-- 1. Tax (6%) is calculated on the gross value
-- 2. Base = gross - tax
-- 3. Platform fee (20%) is calculated on the base
-- 4. Affiliate fee (5%) is calculated on the base (only if affiliate_id is set)
-- 5. Creator net = base - platform_fee - affiliate_fee
DROP VIEW IF EXISTS public.creator_earnings_summary;

CREATE VIEW public.creator_earnings_summary WITH (security_invoker = true) AS
SELECT
  p.id AS creator_id,
  p.name AS creator_name,
  p.username,
  p.balance,

  -- Gross: sum of completed/approved income transactions for this seller
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.type IN ('subscription','tip','deposit')
      AND t.status IN ('completed','approved')
  ), 0)::numeric(10,2) AS total_bruto,

  -- Tax reserve (6% of gross)
  COALESCE(SUM(t.amount * 0.06) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.type IN ('subscription','tip','deposit')
      AND t.status IN ('completed','approved')
  ), 0)::numeric(10,2) AS total_imposto,

  -- Platform fee (20% of base, where base = gross * 0.94)
  COALESCE(SUM(t.amount * 0.94 * 0.20) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.type IN ('subscription','tip','deposit')
      AND t.status IN ('completed','approved')
  ), 0)::numeric(10,2) AS total_taxa_plataforma,

  -- Affiliate fee (5% of base, only when affiliate_id is present)
  COALESCE(SUM(t.amount * 0.94 * 0.05) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.type IN ('subscription','tip','deposit')
      AND t.status IN ('completed','approved')
      AND t.affiliate_id IS NOT NULL
  ), 0)::numeric(10,2) AS total_taxa_afiliado,

  -- Creator net = base - platform - affiliate
  -- Without affiliate: gross * 0.94 * 0.80 = gross * 0.752
  -- With affiliate:    gross * 0.94 * 0.75 = gross * 0.705
  COALESCE(
    SUM(
      CASE
        WHEN t.affiliate_id IS NOT NULL THEN t.amount * 0.94 * 0.75
        ELSE t.amount * 0.94 * 0.80
      END
    ) FILTER (
      WHERE t.seller_id = p.id
        AND t.category = 'creator_content'
        AND t.type IN ('subscription','tip','deposit')
        AND t.status IN ('completed','approved')
    ), 0
  )::numeric(10,2) AS total_liquido,

  -- Pending (not yet released)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.status = 'pending'
      AND t.type IN ('subscription','tip','deposit')
  ), 0)::numeric(10,2) AS total_pendente,

  -- Total withdrawn
  COALESCE(SUM(ABS(t.amount)) FILTER (
    WHERE t.user_id = p.id
      AND t.type = 'withdrawal'
      AND t.status = 'completed'
  ), 0)::numeric(10,2) AS total_sacado,

  -- Current month net earnings
  COALESCE(
    SUM(
      CASE
        WHEN t.affiliate_id IS NOT NULL THEN t.amount * 0.94 * 0.75
        ELSE t.amount * 0.94 * 0.80
      END
    ) FILTER (
      WHERE t.seller_id = p.id
        AND t.category = 'creator_content'
        AND t.type IN ('subscription','tip','deposit')
        AND t.status IN ('completed','approved')
        AND t.created_at >= date_trunc('month', CURRENT_DATE)
    ), 0
  )::numeric(10,2) AS ganhos_mes_atual,

  -- Total sales count
  COUNT(*) FILTER (
    WHERE t.seller_id = p.id
      AND t.category = 'creator_content'
      AND t.type IN ('subscription','tip','deposit')
      AND t.status IN ('completed','approved')
  ) AS total_vendas

FROM profiles p
LEFT JOIN transactions t ON t.seller_id = p.id OR t.user_id = p.id
WHERE p.is_creator = true OR p.plan_type = 'vip'
GROUP BY p.id, p.name, p.username, p.balance;
