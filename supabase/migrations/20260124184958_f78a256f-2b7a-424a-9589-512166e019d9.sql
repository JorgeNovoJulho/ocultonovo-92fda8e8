
-- =====================================================
-- PHASE 5.7: GAMIFICATION SYSTEM
-- Achievements, Levels, XP, Rewards, Leaderboards
-- =====================================================

-- 1. USER LEVELS & XP SYSTEM
CREATE TABLE public.user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_level INTEGER NOT NULL DEFAULT 1,
  current_xp INTEGER NOT NULL DEFAULT 0,
  total_xp INTEGER NOT NULL DEFAULT 0,
  level_up_xp INTEGER NOT NULL DEFAULT 100,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. LEVEL DEFINITIONS
CREATE TABLE public.level_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_number INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  xp_required INTEGER NOT NULL,
  icon TEXT DEFAULT 'star',
  color TEXT DEFAULT '#FFD700',
  perks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ACHIEVEMENTS SYSTEM
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'trophy',
  color TEXT DEFAULT '#FFD700',
  category TEXT DEFAULT 'general',
  xp_reward INTEGER DEFAULT 50,
  is_secret BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  criteria JSONB,
  rarity TEXT DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. USER ACHIEVEMENTS
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  progress INTEGER DEFAULT 100,
  notified BOOLEAN DEFAULT false,
  UNIQUE(user_id, achievement_id)
);

-- 5. XP TRANSACTIONS (audit trail)
CREATE TABLE public.xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. REWARDS CATALOG
CREATE TABLE public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'gift',
  color TEXT DEFAULT '#10B981',
  reward_type TEXT NOT NULL CHECK (reward_type IN ('credits', 'badge', 'feature', 'discount', 'physical')),
  value JSONB NOT NULL,
  cost_xp INTEGER NOT NULL DEFAULT 0,
  cost_credits NUMERIC DEFAULT 0,
  stock INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_limited BOOLEAN DEFAULT false,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  min_level INTEGER DEFAULT 1,
  redemption_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. USER REWARD REDEMPTIONS
CREATE TABLE public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  cost_xp INTEGER,
  cost_credits NUMERIC,
  delivery_details JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. LEADERBOARD SNAPSHOTS (daily/weekly/monthly)
CREATE TABLE public.leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_xp INTEGER DEFAULT 0,
  achievements_count INTEGER DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_type, period_start)
);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to add XP and handle level ups
CREATE OR REPLACE FUNCTION public.add_user_xp(
  p_user_id UUID,
  p_amount INTEGER,
  p_action_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_level user_levels%ROWTYPE;
  v_new_xp INTEGER;
  v_new_total_xp INTEGER;
  v_new_level INTEGER;
  v_level_def level_definitions%ROWTYPE;
  v_leveled_up BOOLEAN := false;
  v_levels_gained INTEGER := 0;
BEGIN
  -- Get or create user level record
  INSERT INTO user_levels (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_user_level FROM user_levels WHERE user_id = p_user_id FOR UPDATE;

  -- Calculate new XP
  v_new_xp := v_user_level.current_xp + p_amount;
  v_new_total_xp := v_user_level.total_xp + p_amount;
  v_new_level := v_user_level.current_level;

  -- Check for level ups
  LOOP
    SELECT * INTO v_level_def FROM level_definitions 
    WHERE level_number = v_new_level + 1;
    
    EXIT WHEN v_level_def IS NULL OR v_new_xp < v_level_def.xp_required;
    
    v_new_xp := v_new_xp - v_level_def.xp_required;
    v_new_level := v_new_level + 1;
    v_leveled_up := true;
    v_levels_gained := v_levels_gained + 1;
  END LOOP;

  -- Get next level XP requirement
  SELECT xp_required INTO v_user_level.level_up_xp 
  FROM level_definitions 
  WHERE level_number = v_new_level + 1;

  -- Update user level
  UPDATE user_levels SET
    current_xp = v_new_xp,
    total_xp = v_new_total_xp,
    current_level = v_new_level,
    level_up_xp = COALESCE(v_user_level.level_up_xp, 1000),
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Log XP transaction
  INSERT INTO xp_transactions (user_id, amount, action_type, description, reference_id)
  VALUES (p_user_id, p_amount, p_action_type, p_description, p_reference_id);

  RETURN jsonb_build_object(
    'success', true,
    'xp_added', p_amount,
    'current_xp', v_new_xp,
    'total_xp', v_new_total_xp,
    'current_level', v_new_level,
    'leveled_up', v_leveled_up,
    'levels_gained', v_levels_gained
  );
END;
$$;

-- Function to unlock achievement
CREATE OR REPLACE FUNCTION public.unlock_achievement(
  p_user_id UUID,
  p_achievement_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement achievements%ROWTYPE;
  v_existing user_achievements%ROWTYPE;
  v_xp_result JSONB;
BEGIN
  -- Get achievement
  SELECT * INTO v_achievement FROM achievements 
  WHERE code = p_achievement_code AND is_active = true;

  IF v_achievement IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Achievement not found');
  END IF;

  -- Check if already unlocked
  SELECT * INTO v_existing FROM user_achievements 
  WHERE user_id = p_user_id AND achievement_id = v_achievement.id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already unlocked');
  END IF;

  -- Unlock achievement
  INSERT INTO user_achievements (user_id, achievement_id)
  VALUES (p_user_id, v_achievement.id);

  -- Award XP
  IF v_achievement.xp_reward > 0 THEN
    SELECT public.add_user_xp(
      p_user_id, 
      v_achievement.xp_reward, 
      'achievement',
      'Desbloqueou: ' || v_achievement.name,
      v_achievement.id
    ) INTO v_xp_result;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'achievement', jsonb_build_object(
      'id', v_achievement.id,
      'name', v_achievement.name,
      'description', v_achievement.description,
      'icon', v_achievement.icon,
      'color', v_achievement.color,
      'xp_reward', v_achievement.xp_reward,
      'rarity', v_achievement.rarity
    ),
    'xp_result', v_xp_result
  );
END;
$$;

-- Function to redeem reward
CREATE OR REPLACE FUNCTION public.redeem_reward(
  p_user_id UUID,
  p_reward_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward rewards%ROWTYPE;
  v_user_level user_levels%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  -- Get reward
  SELECT * INTO v_reward FROM rewards 
  WHERE id = p_reward_id AND is_active = true
  FOR UPDATE;

  IF v_reward IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward not found');
  END IF;

  -- Check availability
  IF v_reward.available_from IS NOT NULL AND now() < v_reward.available_from THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward not yet available');
  END IF;

  IF v_reward.available_until IS NOT NULL AND now() > v_reward.available_until THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reward no longer available');
  END IF;

  -- Check stock
  IF v_reward.is_limited AND v_reward.stock IS NOT NULL AND v_reward.stock <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Out of stock');
  END IF;

  -- Get user level
  SELECT * INTO v_user_level FROM user_levels WHERE user_id = p_user_id;
  
  -- Check level requirement
  IF v_user_level IS NULL OR v_user_level.current_level < v_reward.min_level THEN
    RETURN jsonb_build_object('success', false, 'error', 'Level too low');
  END IF;

  -- Check XP
  IF v_reward.cost_xp > 0 AND v_user_level.total_xp < v_reward.cost_xp THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough XP');
  END IF;

  -- Check credits
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_reward.cost_credits > 0 AND (v_profile.balance IS NULL OR v_profile.balance < v_reward.cost_credits) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough credits');
  END IF;

  -- Deduct costs
  IF v_reward.cost_credits > 0 THEN
    UPDATE profiles SET balance = balance - v_reward.cost_credits WHERE id = p_user_id;
  END IF;

  -- Create redemption
  INSERT INTO reward_redemptions (user_id, reward_id, cost_xp, cost_credits, status)
  VALUES (p_user_id, p_reward_id, v_reward.cost_xp, v_reward.cost_credits, 'pending');

  -- Update stock
  IF v_reward.is_limited AND v_reward.stock IS NOT NULL THEN
    UPDATE rewards SET stock = stock - 1 WHERE id = p_reward_id;
  END IF;

  -- Update redemption count
  UPDATE rewards SET redemption_count = redemption_count + 1 WHERE id = p_reward_id;

  RETURN jsonb_build_object(
    'success', true,
    'reward', jsonb_build_object(
      'id', v_reward.id,
      'name', v_reward.name,
      'reward_type', v_reward.reward_type,
      'value', v_reward.value
    )
  );
END;
$$;

-- =====================================================
-- ENABLE RLS
-- =====================================================
ALTER TABLE public.user_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- User Levels - users can view their own, admins can view all
CREATE POLICY "Users can view own level" ON public.user_levels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage levels" ON public.user_levels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Level Definitions - public read
CREATE POLICY "Level definitions are public" ON public.level_definitions
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage level definitions" ON public.level_definitions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Achievements - public read for non-secret
CREATE POLICY "Public achievements visible" ON public.achievements
  FOR SELECT USING (is_secret = false OR EXISTS (
    SELECT 1 FROM user_achievements ua WHERE ua.achievement_id = id AND ua.user_id = auth.uid()
  ));

CREATE POLICY "Admins can manage achievements" ON public.achievements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- User Achievements - users can view own
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user achievements" ON public.user_achievements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- XP Transactions - users can view own
CREATE POLICY "Users can view own xp history" ON public.xp_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage xp transactions" ON public.xp_transactions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Rewards - public read for active
CREATE POLICY "Active rewards visible" ON public.rewards
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage rewards" ON public.rewards
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Reward Redemptions - users can view own
CREATE POLICY "Users can view own redemptions" ON public.reward_redemptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create redemptions" ON public.reward_redemptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage redemptions" ON public.reward_redemptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Leaderboard - public read
CREATE POLICY "Leaderboard is public" ON public.leaderboard_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage leaderboard" ON public.leaderboard_snapshots
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- =====================================================
-- SEED DATA: Level Definitions
-- =====================================================
INSERT INTO public.level_definitions (level_number, name, xp_required, icon, color, perks) VALUES
(1, 'Novato', 0, 'seedling', '#9CA3AF', '["Acesso básico"]'),
(2, 'Iniciante', 100, 'leaf', '#10B981', '["Desbloqueio de badges básicos"]'),
(3, 'Explorador', 250, 'compass', '#3B82F6', '["Perfil destacado"]'),
(4, 'Aventureiro', 500, 'map', '#8B5CF6', '["Prioridade no chat"]'),
(5, 'Veterano', 1000, 'award', '#F59E0B', '["Badge exclusivo", "Desconto 5%"]'),
(6, 'Expert', 2000, 'star', '#EF4444', '["Desconto 10%", "Acesso antecipado"]'),
(7, 'Mestre', 4000, 'crown', '#FFD700', '["Desconto 15%", "Suporte prioritário"]'),
(8, 'Lenda', 8000, 'gem', '#EC4899', '["Desconto 20%", "Convites exclusivos"]'),
(9, 'Elite', 15000, 'zap', '#14B8A6', '["VIP permanente", "Mentoria"]'),
(10, 'Supremo', 30000, 'flame', '#FF6B6B', '["Todos benefícios", "Badge lendário"]')
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Achievements
-- =====================================================
INSERT INTO public.achievements (code, name, description, icon, color, category, xp_reward, rarity, sort_order) VALUES
-- Social
('first_message', 'Primeiro Contato', 'Envie sua primeira mensagem', 'message-circle', '#3B82F6', 'social', 25, 'common', 1),
('chat_master', 'Mestre do Chat', 'Envie 100 mensagens', 'messages-square', '#8B5CF6', 'social', 100, 'rare', 2),
('popular_10', 'Popular', 'Receba 10 seguidores', 'users', '#10B981', 'social', 50, 'uncommon', 3),
('influencer_100', 'Influenciador', 'Receba 100 seguidores', 'trending-up', '#F59E0B', 'social', 200, 'epic', 4),

-- Engagement
('first_post', 'Primeira Publicação', 'Faça sua primeira publicação', 'image', '#EC4899', 'engagement', 25, 'common', 10),
('content_creator', 'Criador de Conteúdo', 'Faça 10 publicações', 'camera', '#F97316', 'engagement', 75, 'uncommon', 11),
('viral_post', 'Viral', 'Receba 50 likes em um post', 'heart', '#EF4444', 'engagement', 150, 'rare', 12),

-- Activity
('daily_login_7', 'Dedicado', '7 dias consecutivos de login', 'calendar-check', '#14B8A6', 'activity', 100, 'uncommon', 20),
('daily_login_30', 'Comprometido', '30 dias consecutivos de login', 'calendar-heart', '#6366F1', 'activity', 300, 'epic', 21),
('night_owl', 'Coruja', 'Ativo após meia-noite', 'moon', '#1E293B', 'activity', 50, 'uncommon', 22),

-- Verification
('profile_complete', 'Perfil Completo', 'Complete todas as informações do perfil', 'user-check', '#22C55E', 'profile', 50, 'common', 30),
('verified_user', 'Verificado', 'Complete a verificação de identidade', 'shield-check', '#3B82F6', 'profile', 100, 'uncommon', 31),
('verified_couple', 'Casal Verificado', 'Ambos parceiros verificados', 'heart-handshake', '#EC4899', 'profile', 150, 'rare', 32),

-- Spending
('first_purchase', 'Primeiro Investimento', 'Faça sua primeira compra', 'credit-card', '#F59E0B', 'spending', 50, 'common', 40),
('big_spender', 'Grande Investidor', 'Gaste R$500 na plataforma', 'wallet', '#FFD700', 'spending', 250, 'epic', 41),
('generous_tipper', 'Generoso', 'Envie R$100 em gorjetas', 'gift', '#EC4899', 'spending', 150, 'rare', 42),

-- Special
('early_adopter', 'Pioneiro', 'Um dos primeiros 1000 usuários', 'rocket', '#8B5CF6', 'special', 200, 'legendary', 50),
('beta_tester', 'Beta Tester', 'Participou do programa beta', 'flask-conical', '#14B8A6', 'special', 150, 'epic', 51),
('event_winner', 'Campeão', 'Venceu um evento da plataforma', 'trophy', '#FFD700', 'special', 500, 'legendary', 52)
ON CONFLICT DO NOTHING;

-- =====================================================
-- SEED DATA: Sample Rewards
-- =====================================================
INSERT INTO public.rewards (name, description, icon, color, reward_type, value, cost_xp, cost_credits, min_level, is_active) VALUES
('50 Créditos', 'Receba 50 créditos na sua conta', 'coins', '#FFD700', 'credits', '{"amount": 50}', 500, 0, 3, true),
('Badge Exclusivo', 'Badge "Colecionador" para seu perfil', 'award', '#8B5CF6', 'badge', '{"badge_code": "collector"}', 1000, 0, 5, true),
('Desconto 20%', 'Cupom de 20% de desconto em qualquer plano', 'percent', '#10B981', 'discount', '{"percentage": 20, "max_uses": 1}', 750, 0, 4, true),
('Perfil em Destaque', 'Seu perfil destacado por 7 dias', 'sparkles', '#EC4899', 'feature', '{"feature": "profile_boost", "days": 7}', 2000, 0, 6, true),
('VIP por 1 Mês', 'Acesso VIP gratuito por 30 dias', 'crown', '#F59E0B', 'feature', '{"feature": "vip_access", "days": 30}', 5000, 0, 7, true)
ON CONFLICT DO NOTHING;
