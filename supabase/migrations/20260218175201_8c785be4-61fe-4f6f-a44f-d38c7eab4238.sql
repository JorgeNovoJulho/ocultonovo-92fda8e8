-- Tabela de configurações de preços do criador VIP
CREATE TABLE IF NOT EXISTS public.creator_pricing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  -- Assinatura de canal
  subscription_monthly NUMERIC(10,2) DEFAULT 29.90,
  subscription_annual NUMERIC(10,2) DEFAULT 299.90,
  subscription_lifetime NUMERIC(10,2) DEFAULT 999.90,
  subscription_enabled BOOLEAN DEFAULT true,
  -- Preços de conteúdo unitário
  price_per_photo NUMERIC(10,2) DEFAULT 9.90,
  price_per_video NUMERIC(10,2) DEFAULT 19.90,
  price_per_message NUMERIC(10,2) DEFAULT 4.90,
  -- Super DM
  super_dm_enabled BOOLEAN DEFAULT true,
  super_dm_min_price NUMERIC(10,2) DEFAULT 9.90,
  -- Leilões
  auction_starting_price NUMERIC(10,2) DEFAULT 19.90,
  auction_min_increment NUMERIC(10,2) DEFAULT 5.00,
  -- Taxas (informativo, não editável)
  platform_fee_pct NUMERIC(5,2) DEFAULT 20.00,
  tax_reserve_pct NUMERIC(5,2) DEFAULT 6.00,
  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.creator_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators can read their own pricing"
  ON public.creator_pricing_config FOR SELECT
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can insert their own pricing"
  ON public.creator_pricing_config FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update their own pricing"
  ON public.creator_pricing_config FOR UPDATE
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Admins can read all
CREATE POLICY "Admins can read all pricing configs"
  ON public.creator_pricing_config FOR SELECT
  USING (is_admin(auth.uid()));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_creator_pricing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_creator_pricing_updated_at
  BEFORE UPDATE ON public.creator_pricing_config
  FOR EACH ROW EXECUTE FUNCTION public.update_creator_pricing_updated_at();