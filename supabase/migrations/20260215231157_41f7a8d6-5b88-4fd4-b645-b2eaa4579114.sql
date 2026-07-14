
-- 1. Add seller_id to transactions for creator revenue tracking
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) DEFAULT NULL;

-- Index for fast lookups by seller
CREATE INDEX IF NOT EXISTS idx_transactions_seller_id ON public.transactions(seller_id);

-- 2. Create creator_earnings_summary view with 20% platform fee calculated in SQL
CREATE OR REPLACE VIEW public.creator_earnings_summary AS
SELECT 
  p.id AS creator_id,
  p.name AS creator_name,
  p.username,
  p.balance,
  -- Total bruto de vendas (todas as transações onde o criador é o seller)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_bruto,
  -- Taxa da plataforma (20%)
  COALESCE(SUM(t.amount * 0.20) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_taxa_plataforma,
  -- Valor líquido (80%)
  COALESCE(SUM(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ), 0) AS total_liquido,
  -- Pendente (transações pending do seller)
  COALESCE(SUM(t.amount) FILTER (
    WHERE t.seller_id = p.id 
    AND t.status = 'pending'
    AND t.type IN ('subscription', 'tip', 'deposit')
  ), 0) AS total_pendente,
  -- Saques realizados
  COALESCE(SUM(ABS(t.amount)) FILTER (
    WHERE t.user_id = p.id 
    AND t.type = 'withdrawal'
    AND t.status = 'completed'
  ), 0) AS total_sacado,
  -- Ganhos do mês atual
  COALESCE(SUM(t.amount * 0.80) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
    AND t.created_at >= date_trunc('month', CURRENT_DATE)
  ), 0) AS ganhos_mes_atual,
  -- Total de transações
  COUNT(*) FILTER (
    WHERE t.seller_id = p.id 
    AND t.type IN ('subscription', 'tip', 'deposit')
    AND t.status IN ('completed', 'approved')
  ) AS total_vendas
FROM public.profiles p
LEFT JOIN public.transactions t ON (t.seller_id = p.id OR t.user_id = p.id)
WHERE p.is_creator = true OR p.plan_type = 'vip'
GROUP BY p.id, p.name, p.username, p.balance;

-- 3. RLS: Enable on transactions for seller_id queries
-- (transactions already has RLS, just add policy for seller access)
CREATE POLICY "Creators can view their sales" 
ON public.transactions 
FOR SELECT 
USING (
  seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
