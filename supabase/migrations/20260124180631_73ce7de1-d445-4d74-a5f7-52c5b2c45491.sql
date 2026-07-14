-- Tabela de métricas diárias agregadas
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  metric_type TEXT NOT NULL,
  metric_value DECIMAL(15,2) NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(metric_date, metric_type)
);

-- Tabela de eventos de engajamento para heatmap
CREATE TABLE IF NOT EXISTS public.engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_source TEXT,
  hour_of_day INTEGER CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela de previsões
CREATE TABLE IF NOT EXISTS public.growth_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_type TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  predicted_value DECIMAL(15,2) NOT NULL,
  confidence_level DECIMAL(5,2),
  actual_value DECIMAL(15,2),
  model_version TEXT DEFAULT 'v1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(prediction_type, prediction_date)
);

-- Tabela de sessões de usuário para análise
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  session_end TIMESTAMP WITH TIME ZONE,
  page_views INTEGER DEFAULT 0,
  interactions INTEGER DEFAULT 0,
  device_type TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON public.daily_metrics(metric_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_type ON public.daily_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_engagement_events_type ON public.engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_events_created ON public.engagement_events(created_at);
CREATE INDEX IF NOT EXISTS idx_engagement_events_hour ON public.engagement_events(hour_of_day, day_of_week);
CREATE INDEX IF NOT EXISTS idx_growth_predictions_type_date ON public.growth_predictions(prediction_type, prediction_date);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start ON public.user_sessions(session_start);

-- RLS
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Admins podem ver métricas
CREATE POLICY "Admins can view daily metrics" ON public.daily_metrics
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
  );

CREATE POLICY "Admins can manage daily metrics" ON public.daily_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master')
  );

-- Engagement events podem ser inseridos por qualquer usuário logado
CREATE POLICY "Users can insert engagement events" ON public.engagement_events
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can view engagement events" ON public.engagement_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
  );

-- Predictions para admins
CREATE POLICY "Admins can view predictions" ON public.growth_predictions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
  );

CREATE POLICY "System can manage predictions" ON public.growth_predictions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin_master')
  );

-- Sessões de usuário
CREATE POLICY "Users can manage own sessions" ON public.user_sessions
  FOR ALL USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can view all sessions" ON public.user_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master'))
  );

-- Função para registrar evento de engajamento
CREATE OR REPLACE FUNCTION public.log_engagement_event(
  p_event_type TEXT,
  p_event_source TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_now TIMESTAMP WITH TIME ZONE := now();
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  
  INSERT INTO engagement_events (
    user_id, 
    event_type, 
    event_source, 
    hour_of_day, 
    day_of_week, 
    metadata
  ) VALUES (
    v_profile_id,
    p_event_type,
    p_event_source,
    EXTRACT(HOUR FROM v_now)::INTEGER,
    EXTRACT(DOW FROM v_now)::INTEGER,
    p_metadata
  );
END;
$$;

-- Função para agregar métricas diárias
CREATE OR REPLACE FUNCTION public.aggregate_daily_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Novos usuários
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'new_users', COUNT(*)
  FROM profiles WHERE DATE(created_at) = v_today
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;

  -- Transações completadas
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'completed_transactions', COALESCE(SUM(amount), 0)
  FROM transactions WHERE DATE(created_at) = v_today AND status = 'completed' AND amount > 0
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;

  -- Novas assinaturas
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'new_subscriptions', COUNT(*)
  FROM subscriptions WHERE DATE(created_at) = v_today
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;

  -- Posts criados
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'posts_created', COUNT(*)
  FROM posts WHERE DATE(created_at) = v_today
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;

  -- Mensagens enviadas
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'messages_sent', COUNT(*)
  FROM messages WHERE DATE(created_at) = v_today
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;

  -- Marketplace vendas
  INSERT INTO daily_metrics (metric_date, metric_type, metric_value)
  SELECT v_today, 'marketplace_sales', COALESCE(SUM(price_paid), 0)
  FROM marketplace_purchases WHERE DATE(created_at) = v_today AND status = 'completed'
  ON CONFLICT (metric_date, metric_type) 
  DO UPDATE SET metric_value = EXCLUDED.metric_value;
END;
$$;

-- View para heatmap de engajamento
CREATE OR REPLACE VIEW public.engagement_heatmap AS
SELECT 
  hour_of_day,
  day_of_week,
  event_type,
  COUNT(*) as event_count
FROM engagement_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY hour_of_day, day_of_week, event_type;
