
-- 1. Add pending_balance to profiles (saldo pendente antes da liberação)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS pending_balance numeric DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS risk_flags jsonb DEFAULT '[]'::jsonb;

-- 2. Chargeback / refund log table
CREATE TABLE IF NOT EXISTS public.chargeback_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid REFERENCES public.transactions(id),
  payment_external_id text NOT NULL,
  event_type text NOT NULL, -- PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_DISPUTE, etc.
  amount numeric(10,2) NOT NULL DEFAULT 0,
  creator_id uuid REFERENCES public.profiles(id),
  creator_debit numeric(10,2) DEFAULT 0,
  affiliate_id uuid REFERENCES public.profiles(id),
  affiliate_debit numeric(10,2) DEFAULT 0,
  user_id uuid, -- the buyer who triggered the refund
  user_ip text,
  user_fingerprint text,
  access_revoked boolean DEFAULT false,
  plan_revoked text, -- which plan was revoked (premium/vip)
  metadata jsonb DEFAULT '{}'::jsonb,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.chargeback_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can write; admins can read
CREATE POLICY "Admin read chargeback_logs" ON public.chargeback_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- 3. Pending balance release queue
CREATE TABLE IF NOT EXISTS public.pending_balance_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id),
  amount numeric(10,2) NOT NULL,
  source_transaction_id uuid REFERENCES public.transactions(id),
  source_type text NOT NULL, -- 'ppv_income', 'affiliate_commission'
  release_at timestamptz NOT NULL, -- when to move to available_balance
  status text DEFAULT 'pending', -- pending, released, cancelled (chargeback)
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pending_balance_releases ENABLE ROW LEVEL SECURITY;

-- Users can see their own pending releases
CREATE POLICY "Users see own pending releases" ON public.pending_balance_releases
  FOR SELECT USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Admin can see all
CREATE POLICY "Admin read pending releases" ON public.pending_balance_releases
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- 4. Function to add to pending balance (instead of available balance)
CREATE OR REPLACE FUNCTION public.add_to_pending_balance(
  p_user_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET pending_balance = COALESCE(pending_balance, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

-- 5. Function to release pending balance → available balance
CREATE OR REPLACE FUNCTION public.release_pending_balance(
  p_release_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_amount numeric;
  v_status text;
BEGIN
  SELECT profile_id, amount, status INTO v_profile_id, v_amount, v_status
  FROM pending_balance_releases WHERE id = p_release_id;
  
  IF v_status != 'pending' THEN
    RETURN; -- already processed
  END IF;
  
  -- Move from pending to available
  UPDATE profiles SET
    pending_balance = COALESCE(pending_balance, 0) - v_amount,
    balance = COALESCE(balance, 0) + v_amount
  WHERE id = v_profile_id;
  
  UPDATE pending_balance_releases SET status = 'released' WHERE id = p_release_id;
END;
$$;

-- 6. Function to debit balance (for chargebacks — can go negative)
CREATE OR REPLACE FUNCTION public.debit_balance(
  p_user_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET balance = COALESCE(balance, 0) - p_amount
  WHERE id = p_user_id;
END;
$$;

-- 7. Cron job to auto-release pending balances past their release_at date
-- Runs every hour
SELECT cron.schedule(
  'release-pending-balances',
  '0 * * * *',
  $$
  SELECT public.release_pending_balance(id) 
  FROM public.pending_balance_releases 
  WHERE status = 'pending' AND release_at <= now();
  $$
);

-- 8. Enable realtime for pending_balance_releases
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_balance_releases;
