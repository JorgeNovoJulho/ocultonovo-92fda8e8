-- =====================================================
-- CREATOR REFERRAL SYSTEM (MADRINHAS)
-- =====================================================

-- 1. Add creator referral fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS creator_referral_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS referred_by_creator_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS creator_referral_expires_at TIMESTAMPTZ;

-- 2. Create creator_referrals table (tracks madrinha-afilhada relationships)
CREATE TABLE IF NOT EXISTS public.creator_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  madrinha_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  afilhada_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Tracking
  referral_code TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL, -- started_at + 12 months
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Finances (accumulated)
  total_commission_earned NUMERIC DEFAULT 0,
  last_commission_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one afilhada can only have one madrinha
  CONSTRAINT unique_afilhada UNIQUE(afilhada_id)
);

-- 3. Create commission log table
CREATE TABLE IF NOT EXISTS public.creator_referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES public.creator_referrals(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id),
  
  -- Financial breakdown
  gross_amount NUMERIC NOT NULL,        -- Sale value (e.g., R$100)
  platform_fee_original NUMERIC NOT NULL, -- Original fee (e.g., R$20 = 20%)
  commission_amount NUMERIC NOT NULL,   -- Madrinha commission (e.g., R$5 = 5%)
  platform_fee_net NUMERIC NOT NULL,    -- Net platform fee (e.g., R$15 = 15%)
  creator_amount NUMERIC NOT NULL,      -- Creator earnings (e.g., R$80 = 80%)
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.creator_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_referral_commissions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for creator_referrals
CREATE POLICY "Madrinhas can view their referrals"
ON public.creator_referrals FOR SELECT
USING (madrinha_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Afilhadas can view their madrinha"
ON public.creator_referrals FOR SELECT
USING (afilhada_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert referrals"
ON public.creator_referrals FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update referrals"
ON public.creator_referrals FOR UPDATE
USING (true);

-- 6. RLS Policies for commissions
CREATE POLICY "Madrinhas can view their commissions"
ON public.creator_referral_commissions FOR SELECT
USING (referral_id IN (
  SELECT id FROM creator_referrals 
  WHERE madrinha_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
));

CREATE POLICY "System can insert commissions"
ON public.creator_referral_commissions FOR INSERT
WITH CHECK (true);

-- 7. Function to process creator referral commission
CREATE OR REPLACE FUNCTION public.process_creator_referral_commission(
  p_afilhada_profile_id UUID,
  p_transaction_id UUID,
  p_gross_amount NUMERIC,
  p_platform_fee_rate NUMERIC DEFAULT 0.20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral RECORD;
  v_commission_rate NUMERIC := 0.05; -- 5% commission
  v_commission_amount NUMERIC;
  v_platform_fee_original NUMERIC;
  v_platform_fee_net NUMERIC;
  v_creator_amount NUMERIC;
  v_result JSONB;
BEGIN
  -- Find active referral for this afilhada
  SELECT cr.* INTO v_referral
  FROM creator_referrals cr
  WHERE cr.afilhada_id = p_afilhada_profile_id
    AND cr.is_active = true
    AND cr.expires_at > now();
  
  -- If no active referral, return standard split
  IF v_referral.id IS NULL THEN
    v_platform_fee_original := p_gross_amount * p_platform_fee_rate;
    v_creator_amount := p_gross_amount - v_platform_fee_original;
    
    RETURN jsonb_build_object(
      'has_madrinha', false,
      'gross_amount', p_gross_amount,
      'platform_fee', v_platform_fee_original,
      'creator_amount', v_creator_amount,
      'commission_amount', 0
    );
  END IF;
  
  -- Calculate split with madrinha
  v_platform_fee_original := p_gross_amount * p_platform_fee_rate;
  v_commission_amount := p_gross_amount * v_commission_rate;
  v_platform_fee_net := v_platform_fee_original - v_commission_amount;
  v_creator_amount := p_gross_amount - v_platform_fee_original; -- Creator ALWAYS gets 80%
  
  -- Log the commission
  INSERT INTO creator_referral_commissions (
    referral_id, transaction_id, gross_amount,
    platform_fee_original, commission_amount, platform_fee_net, creator_amount,
    description
  ) VALUES (
    v_referral.id, p_transaction_id, p_gross_amount,
    v_platform_fee_original, v_commission_amount, v_platform_fee_net, v_creator_amount,
    'Comissão de venda da afilhada'
  );
  
  -- Update referral totals
  UPDATE creator_referrals
  SET total_commission_earned = total_commission_earned + v_commission_amount,
      last_commission_at = now(),
      updated_at = now()
  WHERE id = v_referral.id;
  
  -- Credit madrinha's balance
  UPDATE profiles
  SET balance = COALESCE(balance, 0) + v_commission_amount
  WHERE id = v_referral.madrinha_id;
  
  -- Return result
  RETURN jsonb_build_object(
    'has_madrinha', true,
    'madrinha_id', v_referral.madrinha_id,
    'referral_id', v_referral.id,
    'gross_amount', p_gross_amount,
    'platform_fee_original', v_platform_fee_original,
    'commission_amount', v_commission_amount,
    'platform_fee_net', v_platform_fee_net,
    'creator_amount', v_creator_amount
  );
END;
$$;

-- 8. Function to generate unique creator referral code
CREATE OR REPLACE FUNCTION public.generate_creator_referral_code(p_profile_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_code TEXT;
  v_suffix INTEGER := 1;
BEGIN
  -- Get username
  SELECT COALESCE(username, SPLIT_PART(name, ' ', 1)) INTO v_username
  FROM profiles WHERE id = p_profile_id;
  
  -- Create base code
  v_code := UPPER(REGEXP_REPLACE(v_username, '[^a-zA-Z0-9]', '', 'g')) || EXTRACT(YEAR FROM now())::TEXT;
  
  -- Check uniqueness and add suffix if needed
  WHILE EXISTS (SELECT 1 FROM profiles WHERE creator_referral_code = v_code) LOOP
    v_code := UPPER(REGEXP_REPLACE(v_username, '[^a-zA-Z0-9]', '', 'g')) || EXTRACT(YEAR FROM now())::TEXT || v_suffix::TEXT;
    v_suffix := v_suffix + 1;
  END LOOP;
  
  -- Update profile with code
  UPDATE profiles SET creator_referral_code = v_code WHERE id = p_profile_id;
  
  RETURN v_code;
END;
$$;

-- 9. Function to link afilhada to madrinha
CREATE OR REPLACE FUNCTION public.link_creator_referral(
  p_afilhada_profile_id UUID,
  p_referral_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_madrinha_id UUID;
  v_referral_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Find madrinha by code
  SELECT id INTO v_madrinha_id
  FROM profiles
  WHERE creator_referral_code = UPPER(p_referral_code)
    AND is_creator = true;
  
  IF v_madrinha_id IS NULL THEN
    RAISE EXCEPTION 'Código de convite inválido';
  END IF;
  
  -- Prevent self-referral
  IF v_madrinha_id = p_afilhada_profile_id THEN
    RAISE EXCEPTION 'Você não pode ser sua própria madrinha';
  END IF;
  
  -- Check if already has a madrinha
  IF EXISTS (SELECT 1 FROM creator_referrals WHERE afilhada_id = p_afilhada_profile_id) THEN
    RAISE EXCEPTION 'Você já possui uma madrinha';
  END IF;
  
  -- Set expiration (12 months from now)
  v_expires_at := now() + INTERVAL '12 months';
  
  -- Create referral relationship
  INSERT INTO creator_referrals (
    madrinha_id, afilhada_id, referral_code, expires_at
  ) VALUES (
    v_madrinha_id, p_afilhada_profile_id, UPPER(p_referral_code), v_expires_at
  )
  RETURNING id INTO v_referral_id;
  
  -- Update afilhada profile
  UPDATE profiles
  SET referred_by_creator_id = v_madrinha_id,
      creator_referral_expires_at = v_expires_at
  WHERE id = p_afilhada_profile_id;
  
  RETURN v_referral_id;
END;
$$;

-- 10. Index for performance
CREATE INDEX IF NOT EXISTS idx_creator_referrals_madrinha ON public.creator_referrals(madrinha_id);
CREATE INDEX IF NOT EXISTS idx_creator_referrals_afilhada ON public.creator_referrals(afilhada_id);
CREATE INDEX IF NOT EXISTS idx_creator_referrals_active ON public.creator_referrals(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(creator_referral_code);

-- 11. Enable realtime for creator_referrals
ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_referrals;