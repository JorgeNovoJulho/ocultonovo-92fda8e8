
-- Marketing Campaigns table
CREATE TABLE public.marketing_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('email', 'push', 'both')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'scheduled', 'event_based')),
  trigger_event TEXT, -- e.g., 'user_inactive_7d', 'subscription_expiring', 'cart_abandoned'
  trigger_config JSONB DEFAULT '{}',
  target_audience TEXT NOT NULL CHECK (target_audience IN ('all', 'active', 'inactive', 'new', 'churned', 'custom')),
  target_filter JSONB DEFAULT '{}',
  email_template_id UUID REFERENCES public.email_templates(id),
  push_title TEXT,
  push_body TEXT,
  push_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stats JSONB DEFAULT '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0, "converted": 0}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign executions log
CREATE TABLE public.campaign_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'converted', 'failed', 'bounced')),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Re-engagement rules
CREATE TABLE public.reengagement_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_condition TEXT NOT NULL CHECK (trigger_condition IN (
    'inactive_3d', 'inactive_7d', 'inactive_14d', 'inactive_30d',
    'subscription_expiring_3d', 'subscription_expiring_7d',
    'cart_abandoned_1h', 'cart_abandoned_24h',
    'new_user_no_activity', 'birthday', 'anniversary'
  )),
  action_type TEXT NOT NULL CHECK (action_type IN ('email', 'push', 'both', 'coupon')),
  email_template_id UUID REFERENCES public.email_templates(id),
  push_title TEXT,
  push_body TEXT,
  coupon_discount INTEGER,
  coupon_valid_days INTEGER,
  delay_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER DEFAULT 5,
  max_per_user INTEGER DEFAULT 1,
  cooldown_days INTEGER DEFAULT 7,
  stats JSONB DEFAULT '{"triggered": 0, "sent": 0, "converted": 0}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User re-engagement history
CREATE TABLE public.user_reengagement_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.reengagement_rules(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  channel TEXT,
  coupon_code TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX idx_marketing_campaigns_scheduled ON public.marketing_campaigns(scheduled_at) WHERE status = 'active';
CREATE INDEX idx_campaign_executions_campaign ON public.campaign_executions(campaign_id);
CREATE INDEX idx_campaign_executions_user ON public.campaign_executions(user_id);
CREATE INDEX idx_campaign_executions_status ON public.campaign_executions(status);
CREATE INDEX idx_reengagement_rules_active ON public.reengagement_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_user_reengagement_user ON public.user_reengagement_history(user_id);
CREATE INDEX idx_user_reengagement_rule ON public.user_reengagement_history(rule_id);

-- Enable RLS
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reengagement_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reengagement_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for marketing_campaigns (admin only)
CREATE POLICY "Admins can manage marketing campaigns"
ON public.marketing_campaigns
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

-- RLS Policies for campaign_executions (admin only)
CREATE POLICY "Admins can view campaign executions"
ON public.campaign_executions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

CREATE POLICY "System can insert campaign executions"
ON public.campaign_executions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update campaign executions"
ON public.campaign_executions
FOR UPDATE
USING (true);

-- RLS Policies for reengagement_rules (admin only)
CREATE POLICY "Admins can manage reengagement rules"
ON public.reengagement_rules
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

-- RLS Policies for user_reengagement_history
CREATE POLICY "Admins can view reengagement history"
ON public.user_reengagement_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin_master', 'admin_marketing')
  )
);

CREATE POLICY "System can manage reengagement history"
ON public.user_reengagement_history
FOR ALL
USING (true);

-- Function to check and trigger re-engagement
CREATE OR REPLACE FUNCTION public.check_reengagement_triggers()
RETURNS TABLE(user_id UUID, rule_id UUID, rule_name TEXT, action_type TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH inactive_users AS (
    SELECT p.id as user_id,
           EXTRACT(EPOCH FROM (now() - COALESCE(p.last_active_at, p.created_at))) / 86400 as days_inactive
    FROM profiles p
    WHERE p.is_suspended = false
  ),
  expiring_subs AS (
    SELECT DISTINCT s.subscriber_id as user_id,
           EXTRACT(EPOCH FROM (s.expires_at - now())) / 86400 as days_until_expiry
    FROM subscriptions s
    WHERE s.status = 'active' AND s.expires_at > now()
  )
  SELECT 
    iu.user_id,
    r.id as rule_id,
    r.name as rule_name,
    r.action_type
  FROM inactive_users iu
  CROSS JOIN reengagement_rules r
  WHERE r.is_active = true
    AND (
      (r.trigger_condition = 'inactive_3d' AND iu.days_inactive >= 3 AND iu.days_inactive < 7)
      OR (r.trigger_condition = 'inactive_7d' AND iu.days_inactive >= 7 AND iu.days_inactive < 14)
      OR (r.trigger_condition = 'inactive_14d' AND iu.days_inactive >= 14 AND iu.days_inactive < 30)
      OR (r.trigger_condition = 'inactive_30d' AND iu.days_inactive >= 30)
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_reengagement_history h
      WHERE h.user_id = iu.user_id 
        AND h.rule_id = r.id
        AND h.triggered_at > now() - (r.cooldown_days || ' days')::interval
    )
  UNION ALL
  SELECT 
    es.user_id,
    r.id as rule_id,
    r.name as rule_name,
    r.action_type
  FROM expiring_subs es
  CROSS JOIN reengagement_rules r
  WHERE r.is_active = true
    AND (
      (r.trigger_condition = 'subscription_expiring_3d' AND es.days_until_expiry <= 3 AND es.days_until_expiry > 0)
      OR (r.trigger_condition = 'subscription_expiring_7d' AND es.days_until_expiry <= 7 AND es.days_until_expiry > 3)
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_reengagement_history h
      WHERE h.user_id = es.user_id 
        AND h.rule_id = r.id
        AND h.triggered_at > now() - (r.cooldown_days || ' days')::interval
    );
END;
$$;

-- Function to get campaign target users
CREATE OR REPLACE FUNCTION public.get_campaign_target_users(
  p_audience TEXT,
  p_filter JSONB DEFAULT '{}'
)
RETURNS TABLE(user_id UUID, email TEXT, username TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email, p.username
  FROM profiles p
  WHERE p.is_suspended = false
    AND (
      p_audience = 'all'
      OR (p_audience = 'active' AND p.last_active_at > now() - interval '7 days')
      OR (p_audience = 'inactive' AND (p.last_active_at IS NULL OR p.last_active_at < now() - interval '14 days'))
      OR (p_audience = 'new' AND p.created_at > now() - interval '7 days')
      OR (p_audience = 'churned' AND p.last_active_at < now() - interval '30 days')
    );
END;
$$;
