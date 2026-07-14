-- =====================================================
-- 1. ADICIONAR CAMPOS DE MÍDIA E DESCRIÇÃO À TABELA CREATOR_GOALS
-- =====================================================
ALTER TABLE public.creator_goals 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT DEFAULT 'image',
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS contributors_count INTEGER DEFAULT 0;

-- Comentários explicativos
COMMENT ON COLUMN public.creator_goals.media_url IS 'URL da imagem ou vídeo de capa da meta';
COMMENT ON COLUMN public.creator_goals.media_type IS 'Tipo de mídia: image ou video';
COMMENT ON COLUMN public.creator_goals.description IS 'Descrição detalhada da meta (máx 2000 chars)';
COMMENT ON COLUMN public.creator_goals.contributors_count IS 'Contador de apoiadores únicos';

-- =====================================================
-- 2. ÍNDICE PARA PERFORMANCE NAS CONTRIBUIÇÕES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_id 
ON public.goal_contributions(goal_id);

CREATE INDEX IF NOT EXISTS idx_goal_contributions_contributor_id 
ON public.goal_contributions(contributor_id);

-- =====================================================
-- 3. TRIGGER PARA ATUALIZAR CONTADOR DE CONTRIBUIDORES
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_goal_contributors_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.creator_goals 
  SET contributors_count = (
    SELECT COUNT(DISTINCT contributor_id) 
    FROM public.goal_contributions 
    WHERE goal_id = NEW.goal_id
  ),
  updated_at = now()
  WHERE id = NEW.goal_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_update_contributors_count ON public.goal_contributions;
CREATE TRIGGER trigger_update_contributors_count
AFTER INSERT ON public.goal_contributions
FOR EACH ROW EXECUTE FUNCTION public.update_goal_contributors_count();

-- =====================================================
-- 4. FUNÇÃO RPC PARA CONTRIBUIÇÃO SEGURA COM CRÉDITOS
-- =====================================================
CREATE OR REPLACE FUNCTION public.contribute_to_goal_with_credits(
  p_goal_id UUID,
  p_amount NUMERIC,
  p_message TEXT DEFAULT NULL,
  p_is_anonymous BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contributor_profile RECORD;
  v_contributor_credits RECORD;
  v_goal RECORD;
  v_creator RECORD;
  v_contribution_id UUID;
BEGIN
  -- Validar valor mínimo
  IF p_amount < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor minimo de 1 credito');
  END IF;

  -- Buscar perfil do contribuidor
  SELECT * INTO v_contributor_profile 
  FROM profiles WHERE user_id = auth.uid();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil nao encontrado');
  END IF;
  
  -- Buscar créditos do contribuidor
  SELECT * INTO v_contributor_credits 
  FROM user_credits WHERE user_id = v_contributor_profile.id;
  
  IF NOT FOUND OR v_contributor_credits.credits_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creditos insuficientes');
  END IF;
  
  IF v_contributor_credits.credits_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seus creditos estao congelados');
  END IF;
  
  -- Buscar a meta
  SELECT * INTO v_goal FROM creator_goals WHERE id = p_goal_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meta nao encontrada ou inativa');
  END IF;
  
  -- Não permitir contribuir para própria meta
  IF v_goal.creator_id = v_contributor_profile.id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voce nao pode contribuir para sua propria meta');
  END IF;
  
  -- Buscar perfil do criador
  SELECT * INTO v_creator FROM profiles WHERE id = v_goal.creator_id;
  
  -- TRANSAÇÃO: Debitar créditos do contribuidor
  UPDATE user_credits 
  SET credits_balance = credits_balance - p_amount, updated_at = now()
  WHERE user_id = v_contributor_profile.id;
  
  -- TRANSAÇÃO: Creditar saldo do criador (imediato)
  UPDATE profiles 
  SET balance = balance + p_amount
  WHERE id = v_creator.id;
  
  -- Registrar contribuição
  INSERT INTO goal_contributions (goal_id, contributor_id, amount, message, is_anonymous)
  VALUES (p_goal_id, v_contributor_profile.id, p_amount, p_message, p_is_anonymous)
  RETURNING id INTO v_contribution_id;
  
  -- Atualizar valor atual da meta
  UPDATE creator_goals 
  SET current_amount = current_amount + p_amount, updated_at = now()
  WHERE id = p_goal_id;
  
  -- Registrar transações
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES 
    (v_contributor_profile.id, p_amount, 'tip', 'completed', 
      'Contribuicao para meta: ' || v_goal.title),
    (v_creator.id, p_amount, 'tip', 'completed', 
      'Recebido de meta: ' || v_goal.title);
  
  -- Notificar criador
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_creator.user_id,
    'goal_contribution',
    '🎯 Nova contribuicao!',
    CASE WHEN p_is_anonymous 
      THEN 'Alguem contribuiu com ' || p_amount || ' creditos para sua meta'
      ELSE v_contributor_profile.name || ' contribuiu com ' || p_amount || ' creditos'
    END,
    jsonb_build_object(
      'goal_id', p_goal_id,
      'contribution_id', v_contribution_id,
      'amount', p_amount,
      'is_anonymous', p_is_anonymous,
      'contributor_id', CASE WHEN p_is_anonymous THEN NULL ELSE v_contributor_profile.id END,
      'contributor_name', CASE WHEN p_is_anonymous THEN NULL ELSE v_contributor_profile.name END
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'contribution_id', v_contribution_id,
    'new_goal_amount', v_goal.current_amount + p_amount,
    'creator_name', v_creator.name
  );
END;
$$;