-- =====================================================
-- DAILY SPIN WHEEL - GAMIFICATION SYSTEM
-- =====================================================

-- 1. Tabela de configuração de prêmios
CREATE TABLE IF NOT EXISTS public.spin_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prize_type TEXT NOT NULL CHECK (prize_type IN ('credits', 'coupon', 'empty')),
  value NUMERIC DEFAULT 0,
  probability INTEGER NOT NULL CHECK (probability > 0 AND probability <= 100),
  color TEXT DEFAULT '#ff007f',
  icon TEXT DEFAULT 'Gift',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de giros diários (com proteção anti-abuso)
CREATE TABLE IF NOT EXISTS public.daily_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spin_date DATE NOT NULL DEFAULT CURRENT_DATE,
  prize_id UUID REFERENCES public.spin_prizes(id),
  prize_type TEXT NOT NULL,
  prize_value NUMERIC DEFAULT 0,
  prize_code TEXT,
  streak_days INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- CRITICAL: Impede múltiplos giros no mesmo dia
  CONSTRAINT unique_user_spin_per_day UNIQUE(user_id, spin_date)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_daily_spins_user_date ON public.daily_spins(user_id, spin_date DESC);
CREATE INDEX IF NOT EXISTS idx_spin_prizes_active ON public.spin_prizes(is_active) WHERE is_active = true;

-- 3. Inserir prêmios padrão com probabilidades balanceadas
INSERT INTO public.spin_prizes (name, prize_type, value, probability, color, icon) VALUES
  ('Tente Amanhã', 'empty', 0, 25, '#374151', 'Clock'),
  ('5% OFF', 'coupon', 5, 30, '#3b82f6', 'Ticket'),
  ('10% OFF', 'coupon', 10, 15, '#8b5cf6', 'Ticket'),
  ('5 Créditos', 'credits', 5, 15, '#22c55e', 'Coins'),
  ('10 Créditos', 'credits', 10, 8, '#eab308', 'Star'),
  ('25 Créditos', 'credits', 25, 5, '#f97316', 'Sparkles'),
  ('50 Créditos', 'credits', 50, 2, '#ef4444', 'Crown');

-- 4. Função RPC para girar a roleta (TODA LÓGICA NO BACKEND)
CREATE OR REPLACE FUNCTION public.spin_daily_wheel(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_spin DATE;
  v_streak INTEGER := 1;
  v_total_weight INTEGER;
  v_random_value INTEGER;
  v_cumulative INTEGER := 0;
  v_prize RECORD;
  v_coupon_code TEXT;
BEGIN
  -- Verificar se já girou hoje (ANTI-ABUSO)
  SELECT spin_date, streak_days INTO v_last_spin, v_streak
  FROM daily_spins
  WHERE user_id = p_user_id
  ORDER BY spin_date DESC
  LIMIT 1;
  
  IF v_last_spin = CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Você já girou hoje! Volte amanhã para mais prêmios.',
      'next_spin_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
    );
  END IF;
  
  -- Calcular streak (dias consecutivos)
  IF v_last_spin = CURRENT_DATE - 1 THEN
    v_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_streak := 1;
  END IF;
  
  -- Obter peso total dos prêmios ativos
  SELECT COALESCE(SUM(probability), 0) INTO v_total_weight
  FROM spin_prizes WHERE is_active = true;
  
  IF v_total_weight = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nenhum prêmio disponível no momento.'
    );
  END IF;
  
  -- Sortear número aleatório
  v_random_value := floor(random() * v_total_weight)::INTEGER;
  
  -- Selecionar prêmio baseado em probabilidade ponderada
  FOR v_prize IN 
    SELECT id, name, prize_type, value, color, icon, probability 
    FROM spin_prizes 
    WHERE is_active = true 
    ORDER BY probability DESC
  LOOP
    v_cumulative := v_cumulative + v_prize.probability;
    IF v_random_value < v_cumulative THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Gerar código de cupom se for desconto
  IF v_prize.prize_type = 'coupon' THEN
    v_coupon_code := 'SPIN' || UPPER(SUBSTRING(MD5(random()::TEXT) FROM 1 FOR 6));
    
    -- Criar cupom válido por 7 dias
    INSERT INTO coupons (creator_id, code, discount_percent, expires_at, max_uses, current_uses, is_active)
    VALUES (p_user_id, v_coupon_code, v_prize.value, now() + INTERVAL '7 days', 1, 0, true);
  END IF;
  
  -- Creditar se for créditos
  IF v_prize.prize_type = 'credits' AND v_prize.value > 0 THEN
    UPDATE profiles 
    SET balance = COALESCE(balance, 0) + v_prize.value
    WHERE id = p_user_id;
  END IF;
  
  -- Registrar o giro (constraint impede duplicação)
  INSERT INTO daily_spins (user_id, spin_date, prize_id, prize_type, prize_value, prize_code, streak_days)
  VALUES (p_user_id, CURRENT_DATE, v_prize.id, v_prize.prize_type, v_prize.value, v_coupon_code, v_streak);
  
  RETURN jsonb_build_object(
    'success', true,
    'prize', jsonb_build_object(
      'id', v_prize.id,
      'name', v_prize.name,
      'type', v_prize.prize_type,
      'value', v_prize.value,
      'color', v_prize.color,
      'icon', v_prize.icon,
      'coupon_code', v_coupon_code
    ),
    'streak_days', v_streak,
    'next_spin_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
  );
END;
$$;

-- 5. Função para verificar elegibilidade
CREATE OR REPLACE FUNCTION public.can_spin_today(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_spin RECORD;
BEGIN
  SELECT spin_date, streak_days, prize_type, prize_value 
  INTO v_last_spin
  FROM daily_spins
  WHERE user_id = p_user_id
  ORDER BY spin_date DESC
  LIMIT 1;
  
  IF v_last_spin IS NULL THEN
    RETURN jsonb_build_object(
      'can_spin', true,
      'streak_days', 0,
      'last_spin', NULL
    );
  END IF;
  
  RETURN jsonb_build_object(
    'can_spin', v_last_spin.spin_date < CURRENT_DATE,
    'streak_days', v_last_spin.streak_days,
    'last_spin', v_last_spin.spin_date::TEXT,
    'last_prize_type', v_last_spin.prize_type,
    'last_prize_value', v_last_spin.prize_value
  );
END;
$$;

-- 6. RLS Policies
ALTER TABLE public.spin_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_spins ENABLE ROW LEVEL SECURITY;

-- Todos podem ver prêmios ativos
CREATE POLICY "Anyone can view active prizes"
ON public.spin_prizes FOR SELECT
USING (is_active = true);

-- Usuários podem ver seus próprios giros
CREATE POLICY "Users can view own spins"
ON public.daily_spins FOR SELECT
USING (auth.uid() = user_id);

-- Apenas função RPC pode inserir giros (SECURITY DEFINER)
CREATE POLICY "System can insert spins"
ON public.daily_spins FOR INSERT
WITH CHECK (false); -- Blocked for direct inserts, RPC uses SECURITY DEFINER