-- Adicionar campo story_reply_id na tabela messages para respostas a stories
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS story_reply_id UUID REFERENCES posts(id) ON DELETE SET NULL;

-- Índice para busca de respostas a stories
CREATE INDEX IF NOT EXISTS idx_messages_story_reply 
ON public.messages(story_reply_id) WHERE story_reply_id IS NOT NULL;

-- Função para calcular score de prioridade do usuário
CREATE OR REPLACE FUNCTION public.calculate_priority_score(
  p_is_verified BOOLEAN,
  p_is_verified_couple BOOLEAN,
  p_plan_type TEXT,
  p_is_creator BOOLEAN
) RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
BEGIN
  -- Plano: VIP = 100, Premium = 50, Free = 0
  IF p_plan_type = 'vip' THEN score := score + 100;
  ELSIF p_plan_type = 'premium' THEN score := score + 50;
  END IF;
  
  -- Verificação individual: +30 pontos
  IF p_is_verified THEN score := score + 30; END IF;
  
  -- Casal verificado: +20 pontos adicionais
  IF p_is_verified_couple THEN score := score + 20; END IF;
  
  -- Criador: +10 pontos
  IF p_is_creator THEN score := score + 10; END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;