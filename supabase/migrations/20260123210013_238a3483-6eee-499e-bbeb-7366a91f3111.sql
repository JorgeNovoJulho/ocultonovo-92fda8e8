-- Adicionar flags de privacidade e exibição ao profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ranking_anonymity boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS show_fan_ranking boolean DEFAULT true;

-- Função RPC para calcular ranking mensal de supporters
CREATE OR REPLACE FUNCTION public.get_monthly_top_supporters(
  p_creator_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  supporter_id UUID,
  supporter_name TEXT,
  supporter_avatar TEXT,
  supporter_username TEXT,
  is_anonymous BOOLEAN,
  total_spent NUMERIC,
  rank_position INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH monthly_spending AS (
    -- Assinaturas
    SELECT 
      s.subscriber_id as supporter,
      COALESCE(s.price, 0) as amount
    FROM subscriptions s
    WHERE s.creator_id = p_creator_id
      AND s.created_at >= date_trunc('month', CURRENT_DATE)
      AND s.status = 'active'
    
    UNION ALL
    
    -- Presentes
    SELECT 
      g.sender_id as supporter,
      COALESCE(g.amount, 0) as amount
    FROM gift_history g
    WHERE g.receiver_id = p_creator_id
      AND g.created_at >= date_trunc('month', CURRENT_DATE)
    
    UNION ALL
    
    -- Media Unlocks (PPV)
    SELECT 
      m.user_id as supporter,
      COALESCE(m.amount, 0) as amount
    FROM media_unlocks m
    WHERE m.creator_id = p_creator_id
      AND m.created_at >= date_trunc('month', CURRENT_DATE)
    
    UNION ALL
    
    -- Super DMs
    SELECT 
      pt.sender_profile_id as supporter,
      COALESCE(pt.amount, 0) as amount
    FROM priority_message_transactions pt
    WHERE pt.receiver_profile_id = p_creator_id
      AND pt.created_at >= date_trunc('month', CURRENT_DATE)
  ),
  aggregated AS (
    SELECT 
      ms.supporter,
      SUM(ms.amount) as total
    FROM monthly_spending ms
    WHERE ms.supporter IS NOT NULL
    GROUP BY ms.supporter
    HAVING SUM(ms.amount) > 0
  ),
  ranked AS (
    SELECT 
      a.supporter,
      a.total,
      ROW_NUMBER() OVER (ORDER BY a.total DESC) as pos
    FROM aggregated a
  )
  SELECT 
    r.supporter as supporter_id,
    CASE WHEN COALESCE(p.ranking_anonymity, false) = true THEN 'Admirador Secreto'::TEXT ELSE p.name END as supporter_name,
    CASE WHEN COALESCE(p.ranking_anonymity, false) = true THEN NULL ELSE p.avatar_url END as supporter_avatar,
    CASE WHEN COALESCE(p.ranking_anonymity, false) = true THEN NULL ELSE p.username END as supporter_username,
    COALESCE(p.ranking_anonymity, false) as is_anonymous,
    r.total as total_spent,
    r.pos::INTEGER as rank_position
  FROM ranked r
  JOIN profiles p ON p.id = r.supporter
  WHERE r.pos <= p_limit
  ORDER BY r.pos;
END;
$$;

-- Função para obter posição do usuário atual no ranking
CREATE OR REPLACE FUNCTION public.get_my_ranking_position(
  p_creator_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  my_position INTEGER,
  my_total_spent NUMERIC,
  amount_to_top3 NUMERIC,
  amount_to_top10 NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top3_threshold NUMERIC;
  v_top10_threshold NUMERIC;
BEGIN
  -- Calcular thresholds
  SELECT MIN(total_spent) INTO v_top3_threshold
  FROM (
    SELECT total_spent FROM get_monthly_top_supporters(p_creator_id, 3)
  ) t;
  
  SELECT MIN(total_spent) INTO v_top10_threshold
  FROM (
    SELECT total_spent FROM get_monthly_top_supporters(p_creator_id, 10)
  ) t;

  RETURN QUERY
  WITH my_spending AS (
    -- Assinaturas
    SELECT COALESCE(s.price, 0) as amount
    FROM subscriptions s
    WHERE s.creator_id = p_creator_id
      AND s.subscriber_id = p_user_id
      AND s.created_at >= date_trunc('month', CURRENT_DATE)
      AND s.status = 'active'
    
    UNION ALL
    
    -- Presentes
    SELECT COALESCE(g.amount, 0) as amount
    FROM gift_history g
    WHERE g.receiver_id = p_creator_id
      AND g.sender_id = p_user_id
      AND g.created_at >= date_trunc('month', CURRENT_DATE)
    
    UNION ALL
    
    -- Media Unlocks
    SELECT COALESCE(m.amount, 0) as amount
    FROM media_unlocks m
    WHERE m.creator_id = p_creator_id
      AND m.user_id = p_user_id
      AND m.created_at >= date_trunc('month', CURRENT_DATE)
    
    UNION ALL
    
    -- Super DMs
    SELECT COALESCE(pt.amount, 0) as amount
    FROM priority_message_transactions pt
    WHERE pt.receiver_profile_id = p_creator_id
      AND pt.sender_profile_id = p_user_id
      AND pt.created_at >= date_trunc('month', CURRENT_DATE)
  ),
  my_total AS (
    SELECT COALESCE(SUM(amount), 0) as total FROM my_spending
  ),
  all_ranked AS (
    SELECT 
      supporter_id,
      total_spent,
      rank_position
    FROM get_monthly_top_supporters(p_creator_id, 1000)
  )
  SELECT 
    COALESCE(ar.rank_position, 0)::INTEGER as my_position,
    mt.total as my_total_spent,
    GREATEST(0, COALESCE(v_top3_threshold, 1) - mt.total + 1) as amount_to_top3,
    GREATEST(0, COALESCE(v_top10_threshold, 1) - mt.total + 1) as amount_to_top10
  FROM my_total mt
  LEFT JOIN all_ranked ar ON ar.supporter_id = p_user_id;
END;
$$;