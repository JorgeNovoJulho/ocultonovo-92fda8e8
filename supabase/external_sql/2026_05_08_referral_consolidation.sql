-- ============================================================
-- REFERRAL CONSOLIDATION — Canonical Ledger + Unified View
-- Non-destructive: legacy tables remain for backward compatibility.
-- Idempotent. Run on EXTERNAL Supabase SQL Editor.
-- ============================================================

-- 1) Canonical ledger: every referral-related financial event lands here
CREATE TABLE IF NOT EXISTS public.referral_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL,        -- who earns
  referred_user_id uuid NOT NULL,    -- who was referred
  creator_id uuid,                   -- if commission relates to a creator's sale
  source text NOT NULL,              -- 'subscription' | 'ppv' | 'marketplace' | 'plan' | 'tip' | 'manual'
  source_ref uuid,                   -- payment_splits.id or transaction id
  gross_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_amount numeric(10,2) NOT NULL DEFAULT 0,
  commission_pct numeric(5,2) NOT NULL DEFAULT 5.00,
  status text NOT NULL DEFAULT 'pending', -- pending | confirmed | paid | refunded | cancelled
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ref_ledger_affiliate
  ON public.referral_ledger(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ref_ledger_referred
  ON public.referral_ledger(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_ref_ledger_creator
  ON public.referral_ledger(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ref_ledger_status
  ON public.referral_ledger(status, created_at DESC);

ALTER TABLE public.referral_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ref_ledger_self ON public.referral_ledger;
CREATE POLICY ref_ledger_self ON public.referral_ledger
  FOR SELECT TO authenticated
  USING (affiliate_id = auth.uid() OR creator_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS ref_ledger_service ON public.referral_ledger;
CREATE POLICY ref_ledger_service ON public.referral_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Unified read-only view across legacy tables
CREATE OR REPLACE VIEW public.v_referrals_unified
WITH (security_invoker=true) AS
SELECT
  l.id,
  l.affiliate_id,
  l.referred_user_id,
  l.creator_id,
  l.source,
  l.gross_amount,
  l.commission_amount,
  l.status,
  l.created_at
FROM public.referral_ledger l
UNION ALL
SELECT
  c.id,
  c.affiliate_id,
  c.referred_user_id,
  NULL::uuid AS creator_id,
  'legacy_commission' AS source,
  COALESCE(c.gross_amount, 0) AS gross_amount,
  COALESCE(c.commission_amount, 0) AS commission_amount,
  COALESCE(c.status, 'confirmed') AS status,
  COALESCE(c.created_at, now()) AS created_at
FROM public.referral_commissions c
WHERE NOT EXISTS (
  SELECT 1 FROM public.referral_ledger l
  WHERE l.source_ref = c.id
);

GRANT SELECT ON public.v_referrals_unified TO authenticated, service_role;

-- 3) RPC: register a referral commission event (called from process_payment_split)
CREATE OR REPLACE FUNCTION public.register_referral_commission(
  p_affiliate_id uuid,
  p_referred_user_id uuid,
  p_creator_id uuid,
  p_source text,
  p_source_ref uuid,
  p_gross_amount numeric,
  p_commission_amount numeric,
  p_commission_pct numeric DEFAULT 5.00,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Anti-autoindicação reinforced
  IF p_affiliate_id = p_referred_user_id OR p_affiliate_id = p_creator_id THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referral_ledger(
    affiliate_id, referred_user_id, creator_id, source, source_ref,
    gross_amount, commission_amount, commission_pct, status, metadata, confirmed_at
  ) VALUES (
    p_affiliate_id, p_referred_user_id, p_creator_id, p_source, p_source_ref,
    p_gross_amount, p_commission_amount, p_commission_pct, 'confirmed', p_metadata, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_referral_commission(uuid,uuid,uuid,text,uuid,numeric,numeric,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_referral_commission(uuid,uuid,uuid,text,uuid,numeric,numeric,numeric,jsonb) TO service_role, authenticated;

-- 4) Aggregated stats view (per affiliate)
CREATE OR REPLACE VIEW public.v_affiliate_stats
WITH (security_invoker=true) AS
SELECT
  affiliate_id,
  COUNT(DISTINCT referred_user_id) AS total_referrals,
  COUNT(*) FILTER (WHERE status IN ('confirmed','paid')) AS confirmed_count,
  COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('confirmed','paid')), 0) AS total_earned,
  COALESCE(SUM(commission_amount) FILTER (WHERE status = 'paid'), 0) AS total_paid,
  COALESCE(SUM(commission_amount) FILTER (WHERE status = 'confirmed'), 0) AS pending_payout
FROM public.referral_ledger
GROUP BY affiliate_id;

GRANT SELECT ON public.v_affiliate_stats TO authenticated, service_role;

-- 5) Mark legacy tables (documentation only)
COMMENT ON TABLE public.referral_commissions IS 'LEGACY — use referral_ledger / v_referrals_unified';
COMMENT ON TABLE public.referral_payouts IS 'LEGACY — use referral_ledger.status=paid';
COMMENT ON TABLE public.referral_network_stats IS 'LEGACY — use v_affiliate_stats';
COMMENT ON TABLE public.referral_tree IS 'LEGACY — derive from referral_ledger.referred_user_id';

NOTIFY pgrst, 'reload schema';
