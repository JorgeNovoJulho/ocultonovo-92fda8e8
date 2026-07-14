-- =============================================
-- FASE 5.11: ANALYTICS AVANÇADO COM DASHBOARDS REAL-TIME
-- =============================================

-- Tabela para snapshots de métricas (histórico)
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(snapshot_date, metric_type, metric_name)
);

-- Tabela para metas e objetivos
CREATE TABLE IF NOT EXISTS public.analytics_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  period_type TEXT DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active',
  achieved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para alertas de métricas
CREATE TABLE IF NOT EXISTS public.analytics_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_type TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  threshold_value NUMERIC NOT NULL,
  comparison_period TEXT DEFAULT 'day',
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  notification_channels TEXT[] DEFAULT ARRAY['admin_notification'],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para logs de alertas disparados
CREATE TABLE IF NOT EXISTS public.analytics_alert_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES public.analytics_alerts(id) ON DELETE CASCADE,
  triggered_value NUMERIC NOT NULL,
  threshold_value NUMERIC NOT NULL,
  message TEXT,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para dashboards customizados
CREATE TABLE IF NOT EXISTS public.custom_dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  layout JSONB DEFAULT '[]',
  widgets JSONB DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para cohort analysis
CREATE TABLE IF NOT EXISTS public.cohort_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_date DATE NOT NULL,
  cohort_type TEXT DEFAULT 'signup',
  period_number INTEGER NOT NULL,
  users_count INTEGER DEFAULT 0,
  retained_count INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cohort_date, cohort_type, period_number)
);

-- Enable RLS
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_alert_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cohort_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Admin only access
CREATE POLICY "Admins can manage analytics_snapshots"
  ON public.analytics_snapshots FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can manage analytics_goals"
  ON public.analytics_goals FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can manage analytics_alerts"
  ON public.analytics_alerts FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can view alert logs"
  ON public.analytics_alert_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can manage custom_dashboards"
  ON public.custom_dashboards FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can view cohort_data"
  ON public.cohort_data FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

-- Função para obter métricas do dashboard em tempo real
CREATE OR REPLACE FUNCTION public.get_realtime_dashboard_metrics()
RETURNS TABLE (
  total_users BIGINT,
  active_users_today BIGINT,
  active_users_week BIGINT,
  new_users_today BIGINT,
  new_users_week BIGINT,
  total_creators BIGINT,
  verified_creators BIGINT,
  total_revenue_today NUMERIC,
  total_revenue_week NUMERIC,
  total_revenue_month NUMERIC,
  total_transactions_today BIGINT,
  avg_transaction_value NUMERIC,
  active_subscriptions BIGINT,
  churn_rate NUMERIC,
  mrr NUMERIC,
  arr NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles)::BIGINT as total_users,
    (SELECT COUNT(*) FROM profiles WHERE updated_at >= CURRENT_DATE)::BIGINT as active_users_today,
    (SELECT COUNT(*) FROM profiles WHERE updated_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT as active_users_week,
    (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE)::BIGINT as new_users_today,
    (SELECT COUNT(*) FROM profiles WHERE created_at >= CURRENT_DATE - INTERVAL '7 days')::BIGINT as new_users_week,
    (SELECT COUNT(*) FROM profiles WHERE is_creator = true)::BIGINT as total_creators,
    (SELECT COUNT(*) FROM profiles WHERE is_creator = true AND is_verified = true)::BIGINT as verified_creators,
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0)::NUMERIC as total_revenue_today,
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '7 days'), 0)::NUMERIC as total_revenue_week,
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)), 0)::NUMERIC as total_revenue_month,
    (SELECT COUNT(*) FROM transactions WHERE status = 'completed' AND created_at >= CURRENT_DATE)::BIGINT as total_transactions_today,
    COALESCE((SELECT AVG(amount) FROM transactions WHERE status = 'completed' AND created_at >= CURRENT_DATE - INTERVAL '30 days'), 0)::NUMERIC as avg_transaction_value,
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')::BIGINT as active_subscriptions,
    0::NUMERIC as churn_rate,
    COALESCE((SELECT SUM(s.price) FROM subscriptions sub JOIN subscription_plans s ON sub.plan_id = s.id WHERE sub.status = 'active'), 0)::NUMERIC as mrr,
    COALESCE((SELECT SUM(s.price) * 12 FROM subscriptions sub JOIN subscription_plans s ON sub.plan_id = s.id WHERE sub.status = 'active'), 0)::NUMERIC as arr;
END;
$$;

-- Função para obter dados de crescimento por período
CREATE OR REPLACE FUNCTION public.get_growth_metrics(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  metric_date DATE,
  new_users INTEGER,
  new_creators INTEGER,
  revenue NUMERIC,
  transactions INTEGER,
  new_subscriptions INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.date::DATE as metric_date,
    COALESCE((SELECT COUNT(*) FROM profiles WHERE created_at::DATE = d.date), 0)::INTEGER as new_users,
    COALESCE((SELECT COUNT(*) FROM profiles WHERE is_creator = true AND created_at::DATE = d.date), 0)::INTEGER as new_creators,
    COALESCE((SELECT SUM(amount) FROM transactions WHERE status = 'completed' AND created_at::DATE = d.date), 0)::NUMERIC as revenue,
    COALESCE((SELECT COUNT(*) FROM transactions WHERE status = 'completed' AND created_at::DATE = d.date), 0)::INTEGER as transactions,
    COALESCE((SELECT COUNT(*) FROM subscriptions WHERE created_at::DATE = d.date), 0)::INTEGER as new_subscriptions
  FROM generate_series(
    CURRENT_DATE - (days_back || ' days')::INTERVAL,
    CURRENT_DATE,
    '1 day'::INTERVAL
  ) AS d(date)
  ORDER BY d.date;
END;
$$;

-- Função para obter top performers
CREATE OR REPLACE FUNCTION public.get_top_performers(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  creator_username TEXT,
  avatar_url TEXT,
  total_revenue NUMERIC,
  subscribers_count BIGINT,
  posts_count BIGINT,
  engagement_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as creator_id,
    p.name as creator_name,
    p.username as creator_username,
    p.avatar_url,
    COALESCE(
      (SELECT SUM(t.amount) FROM transactions t 
       JOIN subscriptions s ON t.subscription_id = s.id 
       WHERE s.creator_id = p.id AND t.status = 'completed'),
      0
    )::NUMERIC as total_revenue,
    (SELECT COUNT(*) FROM subscriptions WHERE creator_id = p.id AND status = 'active')::BIGINT as subscribers_count,
    (SELECT COUNT(*) FROM posts WHERE creator_id = p.id)::BIGINT as posts_count,
    0::NUMERIC as engagement_rate
  FROM profiles p
  WHERE p.is_creator = true
  ORDER BY total_revenue DESC
  LIMIT limit_count;
END;
$$;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON public.analytics_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_type ON public.analytics_snapshots(metric_type);
CREATE INDEX IF NOT EXISTS idx_cohort_data_date ON public.cohort_data(cohort_date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_goals_status ON public.analytics_goals(status);
CREATE INDEX IF NOT EXISTS idx_analytics_alerts_active ON public.analytics_alerts(is_active);