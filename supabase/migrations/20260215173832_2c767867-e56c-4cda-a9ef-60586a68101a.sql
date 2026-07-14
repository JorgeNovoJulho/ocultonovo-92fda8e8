
-- Fix: recreate view with SECURITY INVOKER (default for views, but explicit)
DROP VIEW IF EXISTS public.admin_financial_master_view;

CREATE VIEW public.admin_financial_master_view
WITH (security_invoker = true) AS
SELECT
  COALESCE(SUM(t.amount), 0) AS total_revenue,
  COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= date_trunc('month', NOW())), 0) AS monthly_revenue,
  COALESCE(SUM(t.amount) FILTER (WHERE t.created_at >= NOW() - INTERVAL '7 days'), 0) AS weekly_revenue,
  COALESCE(SUM(t.amount) * 0.20, 0) AS platform_profit,
  COALESCE(SUM(t.amount) * 0.20 * 0.15, 0) AS tax_reserve,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'subscription'), 0) AS subscription_revenue,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'content_purchase'), 0) AS content_revenue,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'message_paid'), 0) AS message_revenue,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'tip'), 0) AS tip_revenue,
  COUNT(*)::int AS total_transactions,
  COUNT(*) FILTER (WHERE t.created_at >= date_trunc('month', NOW()))::int AS monthly_transactions
FROM public.transactions t
WHERE t.status = 'completed';
