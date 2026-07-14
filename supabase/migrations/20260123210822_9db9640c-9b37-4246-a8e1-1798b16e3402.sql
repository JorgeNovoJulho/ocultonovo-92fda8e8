-- Fix security issues from previous migration

-- 1. Drop the overly permissive policy and create proper ones
DROP POLICY IF EXISTS "Service can manage cart abandonment" ON cart_abandonment;

-- Cart abandonment: usuários autenticados podem criar seus próprios
CREATE POLICY "Users can insert own cart abandonment"
  ON cart_abandonment FOR INSERT
  WITH CHECK (
    user_id IS NULL OR 
    user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Cart abandonment: usuários podem atualizar seus próprios (para marcar como clicked)
CREATE POLICY "Users can update own cart abandonment"
  ON cart_abandonment FOR UPDATE
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Admins podem gerenciar todos os carrinhos
CREATE POLICY "Admins can manage all cart abandonment"
  ON cart_abandonment FOR ALL
  USING (is_admin(auth.uid()));

-- 2. Fix the view security definer issue - recreate without security definer
DROP VIEW IF EXISTS public.cart_recovery_metrics;

CREATE VIEW public.cart_recovery_metrics 
WITH (security_invoker = true) AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_carts,
  COUNT(*) FILTER (WHERE status = 'recovered') as recovered_count,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE status = 'clicked') as clicked_count,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'recovered') / NULLIF(COUNT(*), 0), 
    2
  ) as recovery_rate,
  SUM(amount) FILTER (WHERE status = 'recovered') as recovered_revenue
FROM cart_abandonment
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;