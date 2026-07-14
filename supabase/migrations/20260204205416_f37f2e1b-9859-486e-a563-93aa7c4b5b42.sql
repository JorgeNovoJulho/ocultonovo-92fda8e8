-- ================================================
-- FASE 5.19: CORRIGIR FUNÇÕES RESTANTES COM SEARCH_PATH
-- ================================================

-- 1. Funções de gamificação
CREATE OR REPLACE FUNCTION public.award_achievement(p_user_id uuid, p_achievement_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement_id uuid;
  v_xp_reward integer;
BEGIN
  SELECT id, xp_reward INTO v_achievement_id, v_xp_reward
  FROM achievements WHERE code = p_achievement_code AND is_active = true;
  
  IF v_achievement_id IS NULL THEN
    RETURN false;
  END IF;
  
  INSERT INTO user_achievements (user_id, achievement_id)
  VALUES (p_user_id, v_achievement_id)
  ON CONFLICT DO NOTHING;
  
  IF v_xp_reward > 0 THEN
    UPDATE profiles SET total_xp = COALESCE(total_xp, 0) + v_xp_reward
    WHERE id = p_user_id;
  END IF;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_badge(p_user_id uuid, p_badge_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_badge_id uuid;
  v_points integer;
BEGIN
  SELECT id, points INTO v_badge_id, v_points
  FROM badges WHERE code = p_badge_code;
  
  IF v_badge_id IS NULL THEN
    RETURN false;
  END IF;
  
  INSERT INTO user_badges (user_id, badge_id)
  VALUES (p_user_id, v_badge_id)
  ON CONFLICT DO NOTHING;
  
  RETURN true;
END;
$$;

-- 2. Funções de analytics
CREATE OR REPLACE FUNCTION public.record_analytics_event(
  p_event_type text,
  p_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO engagement_events (event_type, user_id, metadata, created_at)
  VALUES (p_event_type, p_user_id, p_metadata, now());
END;
$$;

-- 3. Função para verificar capacidade
CREATE OR REPLACE FUNCTION public.check_user_capacity(p_user_id uuid, p_capacity_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_count integer;
  v_max_count integer;
BEGIN
  -- Placeholder para verificação de capacidade
  RETURN true;
END;
$$;

-- 4. Função para atualizar contadores de engajamento
CREATE OR REPLACE FUNCTION public.update_engagement_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualiza contadores baseado no tipo de evento
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles 
    SET engagement_score = COALESCE(engagement_score, 0) + 1
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 5. Função para limpar dados expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limpar tokens expirados
  DELETE FROM magic_links WHERE expires_at < now();
  
  -- Limpar sessões de impersonificação expiradas
  UPDATE admin_impersonation_sessions 
  SET is_active = false 
  WHERE expires_at < now() AND is_active = true;
END;
$$;

-- 6. Função para calcular métricas de criador
CREATE OR REPLACE FUNCTION public.calculate_creator_metrics(p_creator_id uuid)
RETURNS TABLE(
  total_posts bigint,
  total_followers bigint,
  total_likes bigint,
  avg_engagement numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM posts WHERE user_id = p_creator_id)::bigint,
    (SELECT COUNT(*) FROM follows WHERE following_id = p_creator_id)::bigint,
    (SELECT COUNT(*) FROM post_likes pl JOIN posts p ON pl.post_id = p.id WHERE p.user_id = p_creator_id)::bigint,
    COALESCE((SELECT AVG(engagement_score) FROM posts WHERE user_id = p_creator_id), 0)::numeric;
END;
$$;