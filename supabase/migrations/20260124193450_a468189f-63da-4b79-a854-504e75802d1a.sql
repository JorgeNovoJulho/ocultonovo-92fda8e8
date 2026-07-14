-- =============================================
-- FASE 5.9: Sistema de Referral Avançado
-- =============================================

-- Tabela para programas de referral
CREATE TABLE IF NOT EXISTS public.referral_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Tipo de programa
  program_type VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, madrinha, affiliate, partner
  
  -- Comissões
  commission_type VARCHAR(20) NOT NULL DEFAULT 'percentage', -- percentage, fixed
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10, -- % ou valor fixo
  recurring_commission BOOLEAN DEFAULT false,
  recurring_months INTEGER DEFAULT 0, -- 0 = lifetime
  
  -- Níveis (multi-level)
  max_levels INTEGER DEFAULT 1,
  level_rates JSONB DEFAULT '[10]'::jsonb, -- % por nível [10, 5, 2]
  
  -- Requisitos
  min_referrals_to_activate INTEGER DEFAULT 0,
  min_revenue_to_withdraw NUMERIC(10,2) DEFAULT 50,
  
  -- Bônus
  signup_bonus NUMERIC(10,2) DEFAULT 0,
  first_sale_bonus NUMERIC(10,2) DEFAULT 0,
  milestone_bonuses JSONB DEFAULT '[]'::jsonb, -- [{referrals: 10, bonus: 100}, ...]
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para affiliates/referrers
CREATE TABLE IF NOT EXISTS public.referral_affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.referral_programs(id),
  
  -- Código único
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  custom_slug VARCHAR(50) UNIQUE,
  
  -- Estatísticas
  total_clicks INTEGER DEFAULT 0,
  total_signups INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  total_revenue_generated NUMERIC(12,2) DEFAULT 0,
  total_commission_earned NUMERIC(12,2) DEFAULT 0,
  total_commission_paid NUMERIC(12,2) DEFAULT 0,
  pending_commission NUMERIC(12,2) DEFAULT 0,
  
  -- Nível no programa
  current_level INTEGER DEFAULT 1,
  parent_affiliate_id UUID REFERENCES public.referral_affiliates(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, active, suspended, banned
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  
  -- Pagamento
  payout_method VARCHAR(50), -- pix, bank_transfer, credits
  payout_details JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, program_id)
);

-- Tabela para tracking de cliques
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.referral_affiliates(id),
  
  -- Tracking
  ip_hash VARCHAR(64),
  user_agent TEXT,
  referer TEXT,
  landing_page VARCHAR(500),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  
  -- Device info
  device_type VARCHAR(20),
  browser VARCHAR(50),
  country VARCHAR(2),
  region VARCHAR(100),
  
  -- Conversão
  converted BOOLEAN DEFAULT false,
  converted_user_id UUID,
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para referrals (usuários indicados)
CREATE TABLE IF NOT EXISTS public.referral_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.referral_affiliates(id),
  referred_user_id UUID NOT NULL REFERENCES auth.users(id),
  click_id UUID REFERENCES public.referral_clicks(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'signed_up', -- signed_up, converted, churned
  
  -- Valor gerado
  lifetime_value NUMERIC(12,2) DEFAULT 0,
  commission_generated NUMERIC(12,2) DEFAULT 0,
  
  -- Timestamps
  signed_up_at TIMESTAMPTZ DEFAULT now(),
  first_purchase_at TIMESTAMPTZ,
  last_purchase_at TIMESTAMPTZ,
  churned_at TIMESTAMPTZ,
  
  UNIQUE(referred_user_id)
);

-- Tabela para transações de comissão
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.referral_affiliates(id),
  referral_user_id UUID REFERENCES public.referral_users(id),
  
  -- Origem
  source_type VARCHAR(50) NOT NULL, -- subscription, tip, marketplace, auction
  source_id UUID,
  source_amount NUMERIC(12,2) NOT NULL,
  
  -- Comissão
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  level INTEGER DEFAULT 1,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, paid, cancelled
  
  -- Pagamento
  paid_at TIMESTAMPTZ,
  payout_id UUID,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para payouts
CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.referral_affiliates(id),
  
  amount NUMERIC(12,2) NOT NULL,
  fee NUMERIC(12,2) DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL,
  
  -- Método
  payout_method VARCHAR(50) NOT NULL,
  payout_details JSONB,
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  
  -- Processamento
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  transaction_id VARCHAR(100),
  error_message TEXT,
  
  -- Período
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  commissions_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para milestones/conquistas
CREATE TABLE IF NOT EXISTS public.referral_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.referral_affiliates(id),
  
  milestone_type VARCHAR(50) NOT NULL, -- referrals_count, revenue_generated, first_conversion
  milestone_value INTEGER NOT NULL,
  
  bonus_amount NUMERIC(10,2),
  bonus_type VARCHAR(20), -- cash, credits, badge
  
  achieved_at TIMESTAMPTZ DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  
  UNIQUE(affiliate_id, milestone_type, milestone_value)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_referral_affiliates_user ON public.referral_affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_affiliates_code ON public.referral_affiliates(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_affiliates_parent ON public.referral_affiliates(parent_affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_affiliate ON public.referral_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_converted ON public.referral_clicks(converted) WHERE converted = false;
CREATE INDEX IF NOT EXISTS idx_referral_users_affiliate ON public.referral_users(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_affiliate ON public.referral_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status ON public.referral_commissions(status);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_affiliate ON public.referral_payouts(affiliate_id);

-- RLS
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_milestones ENABLE ROW LEVEL SECURITY;

-- Policies para referral_programs
CREATE POLICY "Anyone can view active programs"
  ON public.referral_programs FOR SELECT
  USING (is_active = true AND is_public = true);

CREATE POLICY "Admin can manage programs"
  ON public.referral_programs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_affiliates
CREATE POLICY "Users can view own affiliate"
  ON public.referral_affiliates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own affiliate"
  ON public.referral_affiliates FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own affiliate"
  ON public.referral_affiliates FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admin can manage all affiliates"
  ON public.referral_affiliates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_clicks (insert only, no auth needed for tracking)
CREATE POLICY "Anyone can create clicks"
  ON public.referral_clicks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Affiliates can view own clicks"
  ON public.referral_clicks FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Admin can view all clicks"
  ON public.referral_clicks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_users
CREATE POLICY "Affiliates can view own referrals"
  ON public.referral_users FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage all referral users"
  ON public.referral_users FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_commissions
CREATE POLICY "Affiliates can view own commissions"
  ON public.referral_commissions FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage all commissions"
  ON public.referral_commissions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_payouts
CREATE POLICY "Affiliates can view own payouts"
  ON public.referral_payouts FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Affiliates can request payouts"
  ON public.referral_payouts FOR INSERT
  WITH CHECK (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage all payouts"
  ON public.referral_payouts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para referral_milestones
CREATE POLICY "Affiliates can view own milestones"
  ON public.referral_milestones FOR SELECT
  USING (affiliate_id IN (SELECT id FROM public.referral_affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Admin can manage all milestones"
  ON public.referral_milestones FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Função para gerar código de referral único
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(20) LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code VARCHAR(20);
  exists_check BOOLEAN;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM public.referral_affiliates WHERE referral_code = code) INTO exists_check;
    IF NOT exists_check THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

-- Função para registrar comissão
CREATE OR REPLACE FUNCTION register_referral_commission(
  p_referred_user_id UUID,
  p_source_type VARCHAR(50),
  p_source_id UUID,
  p_source_amount NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_referral_user RECORD;
  v_affiliate RECORD;
  v_program RECORD;
  v_commission_amount NUMERIC;
  v_current_affiliate_id UUID;
  v_current_level INTEGER := 1;
  v_level_rate NUMERIC;
BEGIN
  -- Buscar usuário referido
  SELECT * INTO v_referral_user FROM public.referral_users WHERE referred_user_id = p_referred_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Atualizar LTV do referido
  UPDATE public.referral_users 
  SET 
    lifetime_value = lifetime_value + p_source_amount,
    last_purchase_at = now(),
    first_purchase_at = COALESCE(first_purchase_at, now()),
    status = 'converted'
  WHERE id = v_referral_user.id;
  
  v_current_affiliate_id := v_referral_user.affiliate_id;
  
  -- Loop para comissões multi-nível
  WHILE v_current_affiliate_id IS NOT NULL LOOP
    SELECT a.*, p.* INTO v_affiliate 
    FROM public.referral_affiliates a
    JOIN public.referral_programs p ON a.program_id = p.id
    WHERE a.id = v_current_affiliate_id AND a.status = 'active';
    
    IF NOT FOUND OR v_current_level > COALESCE(v_affiliate.max_levels, 1) THEN
      EXIT;
    END IF;
    
    -- Calcular taxa do nível
    v_level_rate := COALESCE(
      (v_affiliate.level_rates->>(v_current_level - 1))::NUMERIC,
      v_affiliate.commission_rate
    );
    
    v_commission_amount := ROUND(p_source_amount * (v_level_rate / 100), 2);
    
    -- Inserir comissão
    INSERT INTO public.referral_commissions (
      affiliate_id, referral_user_id, source_type, source_id, 
      source_amount, commission_rate, commission_amount, level, status
    ) VALUES (
      v_current_affiliate_id, v_referral_user.id, p_source_type, p_source_id,
      p_source_amount, v_level_rate, v_commission_amount, v_current_level, 'pending'
    );
    
    -- Atualizar estatísticas do affiliate
    UPDATE public.referral_affiliates
    SET 
      total_revenue_generated = total_revenue_generated + p_source_amount,
      total_commission_earned = total_commission_earned + v_commission_amount,
      pending_commission = pending_commission + v_commission_amount,
      total_conversions = total_conversions + 1,
      updated_at = now()
    WHERE id = v_current_affiliate_id;
    
    -- Atualizar comissão gerada pelo referido
    IF v_current_level = 1 THEN
      UPDATE public.referral_users
      SET commission_generated = commission_generated + v_commission_amount
      WHERE id = v_referral_user.id;
    END IF;
    
    -- Subir para o próximo nível (parent)
    SELECT parent_affiliate_id INTO v_current_affiliate_id 
    FROM public.referral_affiliates WHERE id = v_current_affiliate_id;
    
    v_current_level := v_current_level + 1;
  END LOOP;
END;
$$;

-- Função para obter estatísticas de referral
CREATE OR REPLACE FUNCTION get_referral_stats(p_affiliate_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_affiliates BIGINT,
  active_affiliates BIGINT,
  total_clicks BIGINT,
  total_signups BIGINT,
  total_conversions BIGINT,
  total_revenue NUMERIC,
  total_commissions NUMERIC,
  pending_commissions NUMERIC,
  conversion_rate NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT a.id)::BIGINT as total_affiliates,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active')::BIGINT as active_affiliates,
    COALESCE(SUM(a.total_clicks), 0)::BIGINT as total_clicks,
    COALESCE(SUM(a.total_signups), 0)::BIGINT as total_signups,
    COALESCE(SUM(a.total_conversions), 0)::BIGINT as total_conversions,
    COALESCE(SUM(a.total_revenue_generated), 0)::NUMERIC as total_revenue,
    COALESCE(SUM(a.total_commission_earned), 0)::NUMERIC as total_commissions,
    COALESCE(SUM(a.pending_commission), 0)::NUMERIC as pending_commissions,
    CASE 
      WHEN COALESCE(SUM(a.total_clicks), 0) > 0 
      THEN ROUND((COALESCE(SUM(a.total_conversions), 0)::NUMERIC / SUM(a.total_clicks)) * 100, 2)
      ELSE 0 
    END as conversion_rate
  FROM public.referral_affiliates a
  WHERE p_affiliate_id IS NULL OR a.id = p_affiliate_id;
END;
$$;

-- Seed de programa padrão
INSERT INTO public.referral_programs (name, description, program_type, commission_rate, recurring_commission, max_levels, level_rates, milestone_bonuses)
VALUES 
(
  'Programa Madrinha',
  'Indique criadores e ganhe comissão sobre as vendas deles',
  'madrinha',
  15,
  true,
  2,
  '[15, 5]'::jsonb,
  '[{"referrals": 5, "bonus": 50}, {"referrals": 10, "bonus": 150}, {"referrals": 25, "bonus": 500}]'::jsonb
),
(
  'Programa de Afiliados',
  'Ganhe comissão indicando novos assinantes',
  'affiliate',
  10,
  true,
  1,
  '[10]'::jsonb,
  '[{"referrals": 10, "bonus": 100}, {"referrals": 50, "bonus": 750}]'::jsonb
),
(
  'Parceiro Estratégico',
  'Programa exclusivo para parceiros com alta performance',
  'partner',
  20,
  true,
  3,
  '[20, 10, 5]'::jsonb,
  '[{"referrals": 100, "bonus": 2000}]'::jsonb
)
ON CONFLICT DO NOTHING;