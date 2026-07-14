
-- =====================================================
-- 1. AD CAMPAIGNS TABLE (Anúncios para usuários free)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text NOT NULL,
  target_url text,
  cta_text text DEFAULT 'Saiba Mais',
  placement text NOT NULL DEFAULT 'feed' CHECK (placement IN ('feed', 'sidebar', 'banner', 'modal')),
  priority integer DEFAULT 0,
  impressions_count integer DEFAULT 0,
  clicks_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  starts_at timestamp with time zone DEFAULT now(),
  ends_at timestamp with time zone,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view active ads"
  ON public.ad_campaigns FOR SELECT
  USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

CREATE POLICY "Admins can manage ads"
  ON public.ad_campaigns FOR ALL
  USING (is_admin(auth.uid()));

-- =====================================================
-- 2. AD IMPRESSIONS/CLICKS TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ad_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  interaction_type text NOT NULL CHECK (interaction_type IN ('impression', 'click')),
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.ad_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create interactions"
  ON public.ad_interactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can view interactions"
  ON public.ad_interactions FOR SELECT
  USING (is_admin(auth.uid()));

-- =====================================================
-- 3. GIFT THANK YOU MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.gift_thank_you (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_transaction_id uuid NOT NULL,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  receiver_id uuid NOT NULL REFERENCES public.profiles(id),
  thank_you_type text NOT NULL CHECK (thank_you_type IN ('message', 'photo', 'coupon')),
  content text,
  media_url text,
  coupon_code text,
  coupon_discount integer,
  is_claimed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.gift_thank_you ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their thank you messages"
  ON public.gift_thank_you FOR SELECT
  USING (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) 
    OR receiver_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can create thank you messages"
  ON public.gift_thank_you FOR INSERT
  WITH CHECK (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- =====================================================
-- 4. UPDATE SUBSCRIPTION COUPONS TABLE
-- =====================================================
ALTER TABLE public.subscription_coupons 
ADD COLUMN IF NOT EXISTS expires_at_display text,
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS terms_conditions text;

-- =====================================================
-- 5. DOCUMENT VERIFICATION DEADLINE TRACKING
-- =====================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verification_deadline timestamp with time zone,
ADD COLUMN IF NOT EXISTS verification_reminder_sent boolean DEFAULT false;

-- Function to set verification deadline on profile creation
CREATE OR REPLACE FUNCTION public.set_verification_deadline()
RETURNS TRIGGER AS $$
BEGIN
  -- Set deadline to 15 business days from now (approx 21 calendar days)
  NEW.verification_deadline := now() + INTERVAL '21 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for new profiles
DROP TRIGGER IF EXISTS set_verification_deadline_trigger ON public.profiles;
CREATE TRIGGER set_verification_deadline_trigger
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_verification_deadline();

-- Function to check and freeze unverified profiles
CREATE OR REPLACE FUNCTION public.check_verification_deadline()
RETURNS void AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.id, p.user_id, p.name
    FROM profiles p
    WHERE p.verification_deadline < now()
      AND p.account_status = 'active'
      AND p.is_verified = false
      AND p.is_seed = false
  LOOP
    -- Freeze the account
    UPDATE profiles
    SET 
      account_status = 'frozen',
      frozen_until = now() + INTERVAL '7 days',
      warning_count = warning_count + 1
    WHERE id = r.id;
    
    -- Log in discipline history
    INSERT INTO discipline_history (profile_id, admin_id, action_type, reason, details)
    VALUES (
      r.id,
      r.user_id,
      'freeze',
      'Documentos não verificados no prazo de 15 dias úteis',
      jsonb_build_object('automatic', true, 'reason', 'verification_deadline_expired')
    );
    
    -- Create notification
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      r.user_id,
      'account',
      '⚠️ Conta Congelada',
      'Sua conta foi congelada por não verificar seus documentos no prazo de 15 dias úteis. Verifique seus documentos para desbloquear.',
      jsonb_build_object('action', 'verification_required')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
