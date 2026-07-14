
-- 1. Add is_vip (generated) and vip_tier columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_vip boolean GENERATED ALWAYS AS (plan_type = 'vip') STORED;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS vip_tier text DEFAULT 'none' CHECK (vip_tier IN ('none', 'silver', 'gold', 'diamond'));

-- 2. Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_vip ON public.profiles (is_vip) WHERE is_vip = true;

-- 3. Create v_vip_stats view
CREATE OR REPLACE VIEW public.v_vip_stats WITH (security_invoker=on) AS
SELECT 
  p.id,
  p.user_id,
  p.username,
  p.name,
  p.avatar_url,
  p.is_vip,
  p.vip_tier,
  p.is_verified,
  p.is_creator,
  p.balance,
  p.plan_type,
  p.is_invisible,
  (SELECT count(*) FROM public.profile_visits pv WHERE pv.visited_id = p.id) as total_visits,
  (SELECT count(*) FROM public.profile_visits pv WHERE pv.visited_id = p.id AND pv.visited_at > now() - interval '7 days') as weekly_visits,
  (SELECT count(*) FROM public.subscriptions s WHERE s.creator_id = p.id AND s.status = 'active') as active_subscribers,
  (SELECT count(*) FROM public.post_likes pl JOIN public.posts po ON po.id = pl.post_id WHERE po.user_id = p.id) as total_likes_received
FROM public.profiles p;

-- 4. Fix the trigger function to use plan_type instead of non-existent column
CREATE OR REPLACE FUNCTION public.notify_admin_vip_withdrawal()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_is_vip BOOLEAN;
BEGIN
  SELECT 
    COALESCE(p.name, p.username, 'Criador'),
    COALESCE(p.plan_type = 'vip', false)
  INTO v_username, v_is_vip
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF NEW.status = 'pending' AND (NEW.amount >= 100 OR v_is_vip) THEN
    INSERT INTO public.admin_notifications (type, title, body, data)
    VALUES (
      'verification',
      '💰 Saque Pendente: R$ ' || TRIM(TO_CHAR(NEW.amount, '999G999D00')),
      v_username || ' solicitou saque de R$ ' || TRIM(TO_CHAR(NEW.amount, '999G999D00')) || ' via PIX.',
      jsonb_build_object('withdrawal_id', NEW.id, 'user_id', NEW.user_id, 'amount', NEW.amount, 'url', '/admin/withdrawals')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
