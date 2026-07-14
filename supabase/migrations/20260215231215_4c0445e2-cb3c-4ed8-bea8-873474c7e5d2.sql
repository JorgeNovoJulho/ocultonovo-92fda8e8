
-- Fix: Recreate view with SECURITY INVOKER (default, safe)
DROP VIEW IF EXISTS public.creator_earnings_summary;

CREATE VIEW public.creator_earnings_summary 
WITH (security_invoker = true) AS
SELECT 
  p.id AS creator_id,
  p.name AS creator_name,
  p.username,
  p.balance,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_bruto,
  COALESCE(SUM(t.amount * 0.20) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_taxa_plataforma,
  COALESCE(SUM(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_liquido,
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id 
    AND t.status = 'pending'
    AND t.type IN ('subscription', 'tip', 'deposit')
  ), 0) AS total_pendente,
  COALESCE(SUM(ABS(t.amount)) FILTER (
    WHERE t.user_id = p.id 
    AND t.type = 'withdrawal'
    AND t.status = 'completed'
  ), 0) AS total_sacado,
  COALESCE(SUM(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
    AND t.created_at >= date_trunc('month', CURRENT_DATE)
  ), 0) AS ganhos_mes_atual,
  COUNT(*) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ) AS total_vendas
FROM public.profiles p
LEFT JOIN public.transactions t ON (t.seller_id = p.id OR t.user_id = p.id)
WHERE p.is_creator = true OR p.plan_type = 'vip'
GROUP BY p.id, p.name, p.username, p.balance;
