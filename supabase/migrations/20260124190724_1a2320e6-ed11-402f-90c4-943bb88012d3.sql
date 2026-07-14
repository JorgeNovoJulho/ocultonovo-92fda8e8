-- =============================================
-- FASE 5.8: Sistema de Notificações Push Avançado
-- =============================================

-- Tabela para campanhas de notificação push
CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(100) NOT NULL,
  body TEXT NOT NULL,
  url VARCHAR(500),
  icon VARCHAR(500),
  image_url VARCHAR(500),
  
  -- Targeting
  target_type VARCHAR(50) NOT NULL DEFAULT 'all', -- all, segment, specific_users
  target_segment VARCHAR(50), -- subscribers, active_users, inactive_users, new_users
  target_user_ids UUID[],
  
  -- Scheduling
  is_scheduled BOOLEAN DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Stats
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para deliveries individuais
CREATE TABLE IF NOT EXISTS public.push_campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.push_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  token_id UUID,
  
  status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, clicked, failed
  error_message TEXT,
  
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para templates de notificação
CREATE TABLE IF NOT EXISTS public.push_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  title VARCHAR(100) NOT NULL,
  body TEXT NOT NULL,
  url VARCHAR(500),
  icon VARCHAR(500),
  
  category VARCHAR(50), -- marketing, transactional, engagement, reminder
  variables JSONB DEFAULT '[]'::jsonb, -- {{user_name}}, {{amount}}, etc
  
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para preferências de notificação do usuário
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Canais
  push_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  
  -- Categorias
  marketing_enabled BOOLEAN DEFAULT true,
  transactional_enabled BOOLEAN DEFAULT true,
  social_enabled BOOLEAN DEFAULT true,
  reminders_enabled BOOLEAN DEFAULT true,
  
  -- Horários (quiet hours)
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '08:00',
  
  -- Frequência
  digest_mode BOOLEAN DEFAULT false, -- Agrupar notificações
  digest_frequency VARCHAR(20) DEFAULT 'daily', -- hourly, daily, weekly
  
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Tabela para automation triggers
CREATE TABLE IF NOT EXISTS public.push_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Trigger
  trigger_event VARCHAR(100) NOT NULL, -- new_follower, new_message, subscription_expiring, etc
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Action
  template_id UUID REFERENCES public.push_templates(id),
  custom_title VARCHAR(100),
  custom_body TEXT,
  url_pattern VARCHAR(500),
  
  -- Settings
  delay_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  -- Stats
  triggered_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_push_campaigns_status ON public.push_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled ON public.push_campaigns(scheduled_for) WHERE is_scheduled = true;
CREATE INDEX IF NOT EXISTS idx_push_campaign_deliveries_campaign ON public.push_campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_push_campaign_deliveries_user ON public.push_campaign_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user ON public.user_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_push_automations_trigger ON public.push_automations(trigger_event) WHERE is_active = true;

-- RLS
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_campaign_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_automations ENABLE ROW LEVEL SECURITY;

-- Policies para push_campaigns (admin only)
CREATE POLICY "Admin can manage push campaigns"
  ON public.push_campaigns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para push_campaign_deliveries
CREATE POLICY "Admin can view all deliveries"
  ON public.push_campaign_deliveries FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own deliveries"
  ON public.push_campaign_deliveries FOR SELECT
  USING (user_id = auth.uid());

-- Policies para push_templates
CREATE POLICY "Admin can manage templates"
  ON public.push_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

CREATE POLICY "Anyone can view active templates"
  ON public.push_templates FOR SELECT
  USING (is_active = true);

-- Policies para user_notification_preferences
CREATE POLICY "Users can manage own preferences"
  ON public.user_notification_preferences FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Admin can view all preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Policies para push_automations
CREATE POLICY "Admin can manage automations"
  ON public.push_automations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid()));

-- Função para obter estatísticas de push
CREATE OR REPLACE FUNCTION get_push_stats(days_back INTEGER DEFAULT 30)
RETURNS TABLE (
  total_campaigns BIGINT,
  total_sent BIGINT,
  total_delivered BIGINT,
  total_clicked BIGINT,
  delivery_rate NUMERIC,
  click_rate NUMERIC,
  active_tokens BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT c.id)::BIGINT as total_campaigns,
    COALESCE(SUM(c.sent_count), 0)::BIGINT as total_sent,
    COALESCE(SUM(c.delivered_count), 0)::BIGINT as total_delivered,
    COALESCE(SUM(c.clicked_count), 0)::BIGINT as total_clicked,
    CASE 
      WHEN COALESCE(SUM(c.sent_count), 0) > 0 
      THEN ROUND((COALESCE(SUM(c.delivered_count), 0)::NUMERIC / SUM(c.sent_count)) * 100, 2)
      ELSE 0 
    END as delivery_rate,
    CASE 
      WHEN COALESCE(SUM(c.delivered_count), 0) > 0 
      THEN ROUND((COALESCE(SUM(c.clicked_count), 0)::NUMERIC / SUM(c.delivered_count)) * 100, 2)
      ELSE 0 
    END as click_rate,
    (SELECT COUNT(*)::BIGINT FROM public.push_tokens WHERE last_used_at > now() - interval '30 days') as active_tokens
  FROM public.push_campaigns c
  WHERE c.created_at > now() - (days_back || ' days')::interval;
END;
$$;

-- Seed de templates padrão
INSERT INTO public.push_templates (name, title, body, category, variables) VALUES
('welcome', '👋 Bem-vindo ao OCULTO!', 'Seu perfil está pronto. Explore e conecte-se com pessoas incríveis!', 'transactional', '["user_name"]'),
('new_follower', '🔥 Novo seguidor!', '{{follower_name}} começou a te seguir. Veja o perfil!', 'social', '["follower_name"]'),
('new_message', '💬 Nova mensagem', '{{sender_name}} te enviou uma mensagem', 'social', '["sender_name"]'),
('subscription_expiring', '⏰ Sua assinatura expira em breve', 'Renove agora e não perca seus benefícios Premium!', 'transactional', '["days_left"]'),
('inactive_reminder', '😢 Sentimos sua falta!', 'Volte e veja as novidades que estão te esperando', 'engagement', '["user_name"]'),
('promotion', '🎉 Oferta especial!', '{{promo_text}}', 'marketing', '["promo_text", "discount"]'),
('achievement_unlocked', '🏆 Conquista desbloqueada!', 'Você desbloqueou: {{achievement_name}}', 'engagement', '["achievement_name"]'),
('level_up', '⬆️ Level Up!', 'Parabéns! Você subiu para o nível {{level}}!', 'engagement', '["level", "level_name"]')
ON CONFLICT DO NOTHING;

-- Seed de automations padrão
INSERT INTO public.push_automations (name, trigger_event, custom_title, custom_body, url_pattern, is_active) VALUES
('Novo Seguidor', 'new_follower', '🔥 Novo seguidor!', '{{follower_name}} começou a te seguir', '/profile/{{follower_id}}', true),
('Nova Mensagem', 'new_message', '💬 Nova mensagem', '{{sender_name}}: {{preview}}', '/messages/{{conversation_id}}', true),
('Curtida no Post', 'post_like', '❤️ Seu post foi curtido!', '{{user_name}} curtiu seu post', '/post/{{post_id}}', true),
('Novo Comentário', 'new_comment', '💬 Novo comentário', '{{user_name}} comentou no seu post', '/post/{{post_id}}', true),
('Assinatura Expirando', 'subscription_expiring', '⏰ Sua assinatura expira em {{days}} dias', 'Renove agora e continue aproveitando!', '/subscription', true),
('Achievement Desbloqueado', 'achievement_unlocked', '🏆 Conquista!', 'Você desbloqueou: {{achievement_name}}', '/achievements', true)
ON CONFLICT DO NOTHING;