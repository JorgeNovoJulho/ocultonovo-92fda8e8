-- 1. Adicionar coluna category para distinguir tipo de transação
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'creator_content';

-- 2. Marcar transações existentes de assinatura de plano como 'platform_subscription'
-- (seller_id NULL = pagamento direto à plataforma)
UPDATE public.transactions 
SET category = 'platform_subscription' 
WHERE seller_id IS NULL 
  AND type IN ('subscription', 'deposit') 
  AND (description ILIKE '%Assinatura Mensal OCULTO%' 
    OR description ILIKE '%Assinatura%Premium%' 
    OR description ILIKE '%Assinatura%VIP%'
    OR description ILIKE '%TESTE ADMIN%');

-- 3. Recriar view creator_earnings_summary excluindo assinaturas de plano
CREATE OR REPLACE VIEW public.creator_earnings_summary AS
SELECT 
  p.id AS creator_id,
  p.name AS creator_name,
  p.username,
  p.balance,
  COALESCE(sum(t.amount) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.type IN ('subscription', 'tip', 'deposit') 
      AND t.status IN ('completed', 'approved')
  ), 0) AS total_bruto,
  COALESCE(sum(t.amount * 0.20) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.type IN ('subscription', 'tip', 'deposit') 
      AND t.status IN ('completed', 'approved')
  ), 0) AS total_taxa_plataforma,
  COALESCE(sum(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.type IN ('subscription', 'tip', 'deposit') 
      AND t.status IN ('completed', 'approved')
  ), 0) AS total_liquido,
  COALESCE(sum(t.amount) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.status = 'pending' 
      AND t.type IN ('subscription', 'tip', 'deposit')
  ), 0) AS total_pendente,
  COALESCE(sum(abs(t.amount)) FILTER (
    WHERE t.user_id = p.id 
      AND t.type = 'withdrawal' 
      AND t.status = 'completed'
  ), 0) AS total_sacado,
  COALESCE(sum(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.type IN ('subscription', 'tip', 'deposit') 
      AND t.status IN ('completed', 'approved') 
      AND t.created_at >= date_trunc('month', CURRENT_DATE)
  ), 0) AS ganhos_mes_atual,
  count(*) FILTER (
    WHERE t.seller_id = p.id 
      AND t.category = 'creator_content'
      AND t.type IN ('subscription', 'tip', 'deposit') 
      AND t.status IN ('completed', 'approved')
  ) AS total_vendas
FROM profiles p
LEFT JOIN transactions t ON t.seller_id = p.id OR t.user_id = p.id
WHERE p.is_creator = true OR p.plan_type = 'vip'
GROUP BY p.id, p.name, p.username, p.balance;

-- 4. Índice para queries filtradas por category
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category);