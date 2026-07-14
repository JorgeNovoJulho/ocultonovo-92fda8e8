-- Tabela para contadores Early Bird
CREATE TABLE public.early_bird_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counter_type TEXT UNIQUE NOT NULL CHECK (counter_type IN ('monthly', 'annual')),
  current_count INTEGER NOT NULL DEFAULT 0,
  max_count INTEGER NOT NULL DEFAULT 1000,
  bonus_months INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Inserir contadores iniciais
INSERT INTO public.early_bird_counters (counter_type, max_count, bonus_months) VALUES
('monthly', 1000, 2),
('annual', 1000, 4);

-- Tabela para cupons de assinatura (diferentes dos cupons de criadores)
CREATE TABLE public.subscription_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  is_first_subscription_only BOOLEAN DEFAULT true,
  valid_for_plans TEXT[] DEFAULT ARRAY['monthly', 'annual', 'vip']::TEXT[],
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para rastrear uso de cupons
CREATE TABLE public.subscription_coupon_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.subscription_coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  subscription_id UUID,
  discount_applied NUMERIC NOT NULL,
  original_price NUMERIC NOT NULL,
  final_price NUMERIC NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(coupon_id, user_id)
);

-- Tabela para rastrear assinaturas early bird
CREATE TABLE public.early_bird_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  counter_type TEXT NOT NULL,
  bonus_months INTEGER NOT NULL,
  subscription_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.early_bird_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_coupon_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.early_bird_subscriptions ENABLE ROW LEVEL SECURITY;

-- Early Bird Counters: leitura pública, escrita apenas para serviço
CREATE POLICY "early_bird_counters_public_read" ON public.early_bird_counters
  FOR SELECT USING (true);

CREATE POLICY "early_bird_counters_admin_manage" ON public.early_bird_counters
  FOR ALL USING (is_admin(auth.uid()));

-- Subscription Coupons: leitura para validação, gerenciamento por admin
CREATE POLICY "subscription_coupons_public_read" ON public.subscription_coupons
  FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()) AND starts_at <= now());

CREATE POLICY "subscription_coupons_admin_manage" ON public.subscription_coupons
  FOR ALL USING (is_admin(auth.uid()));

-- Coupon Uses: usuários podem ver seus próprios usos
CREATE POLICY "subscription_coupon_uses_user_read" ON public.subscription_coupon_uses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "subscription_coupon_uses_insert" ON public.subscription_coupon_uses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "subscription_coupon_uses_admin_read" ON public.subscription_coupon_uses
  FOR SELECT USING (is_admin(auth.uid()));

-- Early Bird Subscriptions: usuários podem ver suas próprias
CREATE POLICY "early_bird_subscriptions_user_read" ON public.early_bird_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "early_bird_subscriptions_insert" ON public.early_bird_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "early_bird_subscriptions_admin_read" ON public.early_bird_subscriptions
  FOR SELECT USING (is_admin(auth.uid()));

-- Função para incrementar contador early bird e verificar disponibilidade
CREATE OR REPLACE FUNCTION public.claim_early_bird_slot(
  p_counter_type TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counter RECORD;
  v_result JSONB;
BEGIN
  -- Buscar contador com lock
  SELECT * INTO v_counter
  FROM early_bird_counters
  WHERE counter_type = p_counter_type
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Counter not found');
  END IF;
  
  IF NOT v_counter.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Promotion ended', 'slots_remaining', 0);
  END IF;
  
  IF v_counter.current_count >= v_counter.max_count THEN
    RETURN jsonb_build_object('success', false, 'error', 'No slots available', 'slots_remaining', 0);
  END IF;
  
  -- Incrementar contador
  UPDATE early_bird_counters
  SET current_count = current_count + 1,
      updated_at = now()
  WHERE id = v_counter.id;
  
  -- Registrar uso
  INSERT INTO early_bird_subscriptions (user_id, counter_type, bonus_months)
  VALUES (p_user_id, p_counter_type, v_counter.bonus_months);
  
  RETURN jsonb_build_object(
    'success', true,
    'bonus_months', v_counter.bonus_months,
    'slots_remaining', v_counter.max_count - v_counter.current_count - 1,
    'position', v_counter.current_count + 1
  );
END;
$$;

-- Função para validar e aplicar cupom de assinatura
CREATE OR REPLACE FUNCTION public.validate_subscription_coupon(
  p_code TEXT,
  p_user_id UUID,
  p_plan_type TEXT,
  p_original_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon RECORD;
  v_already_used BOOLEAN;
  v_has_previous_subscription BOOLEAN;
  v_discount NUMERIC;
  v_final_price NUMERIC;
BEGIN
  -- Buscar cupom
  SELECT * INTO v_coupon
  FROM subscription_coupons
  WHERE UPPER(code) = UPPER(p_code)
    AND is_active = true
    AND starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now());
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom inválido ou expirado');
  END IF;
  
  -- Verificar limite de usos
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom esgotado');
  END IF;
  
  -- Verificar se o plano é válido para este cupom
  IF NOT (p_plan_type = ANY(v_coupon.valid_for_plans)) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cupom não válido para este plano');
  END IF;
  
  -- Verificar se usuário já usou este cupom
  SELECT EXISTS(
    SELECT 1 FROM subscription_coupon_uses
    WHERE coupon_id = v_coupon.id AND user_id = p_user_id
  ) INTO v_already_used;
  
  IF v_already_used THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Você já utilizou este cupom');
  END IF;
  
  -- Verificar se é primeira assinatura (se necessário)
  IF v_coupon.is_first_subscription_only THEN
    SELECT EXISTS(
      SELECT 1 FROM subscriptions s
      JOIN profiles p ON s.subscriber_id = p.id
      WHERE p.user_id = p_user_id
    ) INTO v_has_previous_subscription;
    
    IF v_has_previous_subscription THEN
      RETURN jsonb_build_object('valid', false, 'error', 'Cupom válido apenas para primeira assinatura');
    END IF;
  END IF;
  
  -- Calcular desconto
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := p_original_price * (v_coupon.discount_value / 100);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;
  
  -- Garantir que o preço final não seja negativo
  v_final_price := GREATEST(0, p_original_price - v_discount);
  
  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'coupon_name', v_coupon.name,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_applied', v_discount,
    'original_price', p_original_price,
    'final_price', v_final_price
  );
END;
$$;

-- Função para aplicar cupom após confirmação de pagamento
CREATE OR REPLACE FUNCTION public.apply_subscription_coupon(
  p_coupon_id UUID,
  p_user_id UUID,
  p_subscription_id UUID,
  p_discount_applied NUMERIC,
  p_original_price NUMERIC,
  p_final_price NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Registrar uso do cupom
  INSERT INTO subscription_coupon_uses (
    coupon_id, user_id, subscription_id,
    discount_applied, original_price, final_price
  ) VALUES (
    p_coupon_id, p_user_id, p_subscription_id,
    p_discount_applied, p_original_price, p_final_price
  );
  
  -- Incrementar contador de usos
  UPDATE subscription_coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE id = p_coupon_id;
  
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_subscription_coupons_timestamp
  BEFORE UPDATE ON public.subscription_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_site_section_timestamp();

-- Inserir cupom de exemplo "BEMVINDO10"
INSERT INTO public.subscription_coupons (code, name, description, discount_type, discount_value, is_first_subscription_only)
VALUES ('BEMVINDO10', 'Boas-vindas 10%', 'Desconto de 10% para novos assinantes', 'percentage', 10, true);