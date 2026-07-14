-- =====================================================
-- CART ABANDONMENT SYSTEM
-- =====================================================

-- 1. Tabela principal de carrinhos abandonados
CREATE TABLE IF NOT EXISTS public.cart_abandonment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Dados do carrinho
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'annual')),
  amount NUMERIC NOT NULL,
  coupon_code TEXT,
  ghost_mode BOOLEAN DEFAULT false,
  creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Contato
  phone_number TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  
  -- Status do carrinho
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recovered', 'sent', 'expired', 'failed', 'clicked')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  
  -- Magic Link para checkout sem login
  magic_link_token UUID DEFAULT gen_random_uuid(),
  magic_link_expires_at TIMESTAMPTZ,
  
  -- Metadata
  attempts_count INTEGER DEFAULT 0,
  last_error TEXT,
  whatsapp_message_id TEXT
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_cart_abandonment_pending 
  ON cart_abandonment(status, scheduled_send_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cart_abandonment_user 
  ON cart_abandonment(user_id);

CREATE INDEX IF NOT EXISTS idx_cart_abandonment_token 
  ON cart_abandonment(magic_link_token);

CREATE INDEX IF NOT EXISTS idx_cart_abandonment_phone 
  ON cart_abandonment(phone_number);

-- Trigger para definir scheduled_send_at automaticamente (10 minutos)
CREATE OR REPLACE FUNCTION public.set_cart_scheduled_send()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_send_at IS NULL THEN
    NEW.scheduled_send_at := NEW.created_at + INTERVAL '10 minutes';
  END IF;
  IF NEW.magic_link_expires_at IS NULL THEN
    NEW.magic_link_expires_at := NEW.created_at + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_set_cart_scheduled_send
  BEFORE INSERT ON cart_abandonment
  FOR EACH ROW
  EXECUTE FUNCTION set_cart_scheduled_send();

-- =====================================================
-- WHATSAPP CONFIG
-- =====================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider settings
  provider TEXT NOT NULL DEFAULT 'z-api' CHECK (provider IN ('z-api', 'twilio', 'evolution-api', 'wppconnect')),
  
  -- Credentials (encrypted)
  api_key_encrypted TEXT,
  instance_id TEXT,
  account_sid TEXT,
  from_number TEXT,
  webhook_secret TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  sandbox_mode BOOLEAN DEFAULT true,
  
  -- Rate limiting
  max_messages_per_hour INTEGER DEFAULT 100,
  delay_between_messages_ms INTEGER DEFAULT 2000,
  
  -- Templates
  cart_recovery_template TEXT DEFAULT 'Oi {name}! 👋

Vi que você quase entrou para o meu VIP. Aconteceu algo?

Aqui está um link direto para finalizar:
{link}

💎 Acesso exclusivo te esperando!',
  
  -- Audit
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE cart_abandonment ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

-- Cart abandonment: usuários podem ver seus próprios carrinhos
CREATE POLICY "Users can view own cart abandonment"
  ON cart_abandonment FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Cart abandonment: sistema pode inserir/atualizar (via service role)
CREATE POLICY "Service can manage cart abandonment"
  ON cart_abandonment FOR ALL
  USING (true)
  WITH CHECK (true);

-- WhatsApp config: apenas admins podem ver/editar
CREATE POLICY "Admins can manage whatsapp config"
  ON whatsapp_config FOR ALL
  USING (is_admin(auth.uid()));

-- =====================================================
-- CART RECOVERY METRICS VIEW
-- =====================================================

CREATE OR REPLACE VIEW public.cart_recovery_metrics AS
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

-- Adicionar phone_number ao profiles se não existir
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Insert default whatsapp config
INSERT INTO whatsapp_config (provider, sandbox_mode, is_active)
VALUES ('z-api', true, false)
ON CONFLICT DO NOTHING;