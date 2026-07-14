-- =============================================
-- CORREÇÃO: RLS RECURSIVA EM CONVERSATION_PARTICIPANTS
-- =============================================

-- Dropar policies problemáticas
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can leave conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their participation" ON public.conversation_participants;

-- Criar função segura para verificar participação
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = conv_id AND user_id = check_user_id
  );
$$;

-- Recriar policies usando a função
CREATE POLICY "Users can view their conversations"
  ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert into conversations"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their participation"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their participation"
  ON public.conversation_participants FOR DELETE
  USING (user_id = auth.uid());

-- =============================================
-- FASE 5.12: SISTEMA DE WEBHOOKS E INTEGRAÇÕES
-- =============================================

-- Tabela para endpoints de webhook
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  secret_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  headers JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  retry_count INTEGER DEFAULT 3,
  timeout_ms INTEGER DEFAULT 30000,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para logs de webhooks
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  attempt_number INTEGER DEFAULT 1,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para eventos disponíveis
CREATE TABLE IF NOT EXISTS public.webhook_event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  payload_schema JSONB,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para integrações de terceiros
CREATE TABLE IF NOT EXISTS public.third_party_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  credentials JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle',
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para API keys
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT[] DEFAULT ARRAY['read']::TEXT[],
  rate_limit INTEGER DEFAULT 1000,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela para logs de uso da API
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.third_party_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Admin only
CREATE POLICY "Admins can manage webhook_endpoints"
  ON public.webhook_endpoints FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can view webhook_logs"
  ON public.webhook_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Anyone can view event types"
  ON public.webhook_event_types FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage event types"
  ON public.webhook_event_types FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can manage integrations"
  ON public.third_party_integrations FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can manage api_keys"
  ON public.api_keys FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

CREATE POLICY "Admins can view api_usage_logs"
  ON public.api_usage_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'admin_master')));

-- Índices
CREATE INDEX IF NOT EXISTS idx_webhook_logs_endpoint ON public.webhook_logs(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_key ON public.api_usage_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON public.api_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys(key_prefix);

-- Seed eventos de webhook
INSERT INTO public.webhook_event_types (code, name, description, category) VALUES
  ('user.created', 'Novo Usuário', 'Disparado quando um novo usuário se cadastra', 'users'),
  ('user.verified', 'Usuário Verificado', 'Disparado quando um usuário é verificado', 'users'),
  ('subscription.created', 'Nova Assinatura', 'Disparado quando uma assinatura é criada', 'subscriptions'),
  ('subscription.cancelled', 'Assinatura Cancelada', 'Disparado quando uma assinatura é cancelada', 'subscriptions'),
  ('subscription.renewed', 'Assinatura Renovada', 'Disparado quando uma assinatura é renovada', 'subscriptions'),
  ('payment.completed', 'Pagamento Confirmado', 'Disparado quando um pagamento é confirmado', 'payments'),
  ('payment.failed', 'Pagamento Falhou', 'Disparado quando um pagamento falha', 'payments'),
  ('post.created', 'Novo Post', 'Disparado quando um post é publicado', 'content'),
  ('message.sent', 'Mensagem Enviada', 'Disparado quando uma mensagem é enviada', 'messages'),
  ('tip.received', 'Gorjeta Recebida', 'Disparado quando uma gorjeta é recebida', 'payments')
ON CONFLICT (code) DO NOTHING;

-- Função para disparar webhook
CREATE OR REPLACE FUNCTION public.trigger_webhook(
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_endpoint RECORD;
BEGIN
  -- Buscar todos os endpoints ativos que assinam este evento
  FOR v_endpoint IN 
    SELECT * FROM webhook_endpoints 
    WHERE is_active = true 
    AND p_event_type = ANY(events)
  LOOP
    -- Inserir log (será processado por edge function)
    INSERT INTO webhook_logs (endpoint_id, event_type, payload, attempt_number)
    VALUES (v_endpoint.id, p_event_type, p_payload, 1);
  END LOOP;
END;
$$;

-- Função para estatísticas de webhooks
CREATE OR REPLACE FUNCTION public.get_webhook_stats()
RETURNS TABLE (
  total_endpoints BIGINT,
  active_endpoints BIGINT,
  total_logs_today BIGINT,
  successful_today BIGINT,
  failed_today BIGINT,
  avg_response_time NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM webhook_endpoints)::BIGINT,
    (SELECT COUNT(*) FROM webhook_endpoints WHERE is_active = true)::BIGINT,
    (SELECT COUNT(*) FROM webhook_logs WHERE created_at >= CURRENT_DATE)::BIGINT,
    (SELECT COUNT(*) FROM webhook_logs WHERE created_at >= CURRENT_DATE AND success = true)::BIGINT,
    (SELECT COUNT(*) FROM webhook_logs WHERE created_at >= CURRENT_DATE AND success = false)::BIGINT,
    COALESCE((SELECT AVG(response_time_ms) FROM webhook_logs WHERE created_at >= CURRENT_DATE AND response_time_ms IS NOT NULL), 0)::NUMERIC;
END;
$$;