-- Função RPC para buscar usuários por email (apenas admins)
CREATE OR REPLACE FUNCTION search_users_with_email(p_query TEXT)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name TEXT,
  username TEXT,
  email TEXT,
  avatar_url TEXT,
  plan_type TEXT,
  payment_status TEXT,
  payment_due_date TIMESTAMPTZ,
  is_creator BOOLEAN,
  is_verified BOOLEAN,
  balance NUMERIC,
  balance_frozen BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.name,
    p.username,
    u.email,
    p.avatar_url,
    p.plan_type,
    p.payment_status,
    p.payment_due_date,
    p.is_creator,
    p.is_verified,
    p.balance,
    p.balance_frozen,
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users u ON p.user_id = u.id
  WHERE 
    (p.is_seed = false OR p.is_seed IS NULL)
    AND (
      u.email ILIKE '%' || p_query || '%'
      OR p.name ILIKE '%' || p_query || '%'
      OR p.username ILIKE '%' || p_query || '%'
    )
  ORDER BY p.name
  LIMIT 50;
END;
$$;

-- Função para obter métricas de distribuição por plano
CREATE OR REPLACE FUNCTION get_plan_distribution()
RETURNS TABLE (
  plan_type TEXT,
  user_count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  
  -- Contar total de usuários reais
  SELECT COUNT(*) INTO v_total
  FROM profiles
  WHERE is_seed = false OR is_seed IS NULL;
  
  RETURN QUERY
  SELECT 
    COALESCE(p.plan_type, 'free') as plan_type,
    COUNT(*) as user_count,
    CASE WHEN v_total > 0 
      THEN ROUND((COUNT(*)::NUMERIC / v_total) * 100, 2) 
      ELSE 0 
    END as percentage
  FROM profiles p
  WHERE p.is_seed = false OR p.is_seed IS NULL
  GROUP BY COALESCE(p.plan_type, 'free')
  ORDER BY user_count DESC;
END;
$$;

-- Função para obter métricas de receita
CREATE OR REPLACE FUNCTION get_revenue_metrics()
RETURNS TABLE (
  total_revenue NUMERIC,
  monthly_revenue NUMERIC,
  mrr_estimate NUMERIC,
  avg_ticket NUMERIC,
  total_transactions BIGINT,
  monthly_transactions BIGINT,
  paid_users BIGINT,
  churn_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_revenue NUMERIC;
  v_monthly_revenue NUMERIC;
  v_total_transactions BIGINT;
  v_monthly_transactions BIGINT;
  v_paid_users BIGINT;
  v_churned_last_month BIGINT;
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  
  -- Receita total
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM transactions
  WHERE status = 'completed' AND amount > 0;
  
  -- Receita mensal (mês atual)
  SELECT COALESCE(SUM(amount), 0) INTO v_monthly_revenue
  FROM transactions
  WHERE status = 'completed' 
    AND amount > 0
    AND created_at >= date_trunc('month', CURRENT_DATE);
  
  -- Total de transações
  SELECT COUNT(*) INTO v_total_transactions
  FROM transactions
  WHERE status = 'completed' AND amount > 0;
  
  -- Transações do mês
  SELECT COUNT(*) INTO v_monthly_transactions
  FROM transactions
  WHERE status = 'completed' 
    AND amount > 0
    AND created_at >= date_trunc('month', CURRENT_DATE);
  
  -- Usuários pagantes (plano != free)
  SELECT COUNT(*) INTO v_paid_users
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND plan_type IN ('premium', 'vip');
  
  -- Churn estimado (usuários que tinham plano pago e agora são free)
  -- Simplificado: baseado em payment_status = 'suspended' ou 'overdue'
  SELECT COUNT(*) INTO v_churned_last_month
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND payment_status IN ('suspended', 'overdue');
  
  RETURN QUERY SELECT
    v_total_revenue,
    v_monthly_revenue,
    v_paid_users * 29.90, -- MRR estimado baseado em preço médio
    CASE WHEN v_total_transactions > 0 
      THEN v_total_revenue / v_total_transactions 
      ELSE 0 
    END,
    v_total_transactions,
    v_monthly_transactions,
    v_paid_users,
    CASE WHEN v_paid_users > 0 
      THEN ROUND((v_churned_last_month::NUMERIC / GREATEST(v_paid_users, 1)) * 100, 2) 
      ELSE 0 
    END;
END;
$$;

-- Função para obter todos usuários pagantes com email (para exportação)
CREATE OR REPLACE FUNCTION get_all_paid_users_with_email()
RETURNS TABLE (
  id UUID,
  name TEXT,
  username TEXT,
  email TEXT,
  plan_type TEXT,
  payment_status TEXT,
  payment_due_date TIMESTAMPTZ,
  balance NUMERIC,
  is_creator BOOLEAN,
  is_verified BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.username,
    u.email,
    COALESCE(p.plan_type, 'free'),
    COALESCE(p.payment_status, 'active'),
    p.payment_due_date,
    COALESCE(p.balance, 0),
    COALESCE(p.is_creator, false),
    COALESCE(p.is_verified, false),
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users u ON p.user_id = u.id
  WHERE p.is_seed = false OR p.is_seed IS NULL
  ORDER BY 
    CASE p.plan_type 
      WHEN 'vip' THEN 1 
      WHEN 'premium' THEN 2 
      ELSE 3 
    END,
    p.name;
END;
$$;