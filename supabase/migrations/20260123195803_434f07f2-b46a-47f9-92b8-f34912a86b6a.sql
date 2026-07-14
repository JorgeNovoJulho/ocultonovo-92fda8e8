-- =====================================================
-- BROADCAST PPV SYSTEM
-- Sistema de mensagens em massa com mídia paga
-- =====================================================

-- 1. Tabela de Broadcasts (Campanhas)
CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  is_ppv BOOLEAN DEFAULT false,
  ppv_price NUMERIC DEFAULT 0 CHECK (ppv_price >= 0),
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all_followers', 'active_subscribers', 'expired_subscribers')),
  
  -- Métricas
  total_recipients INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  unlock_count INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Entregas Individuais
CREATE TABLE public.broadcast_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'unlocked', 'failed')),
  error_message TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  unlocked_at TIMESTAMP WITH TIME ZONE,
  paid_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(broadcast_id, recipient_id)
);

-- 3. Adicionar broadcast_id às mensagens
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES broadcasts(id) ON DELETE SET NULL;

-- 4. Índices para performance
CREATE INDEX idx_broadcasts_creator ON broadcasts(creator_id);
CREATE INDEX idx_broadcasts_status ON broadcasts(status);
CREATE INDEX idx_broadcasts_created ON broadcasts(created_at DESC);
CREATE INDEX idx_broadcast_deliveries_broadcast ON broadcast_deliveries(broadcast_id);
CREATE INDEX idx_broadcast_deliveries_recipient ON broadcast_deliveries(recipient_id);
CREATE INDEX idx_broadcast_deliveries_status ON broadcast_deliveries(status);
CREATE INDEX idx_messages_broadcast ON messages(broadcast_id) WHERE broadcast_id IS NOT NULL;

-- 5. RLS Policies para Broadcasts
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_deliveries ENABLE ROW LEVEL SECURITY;

-- Criadores podem ver seus próprios broadcasts
CREATE POLICY "Creators can view own broadcasts"
ON public.broadcasts FOR SELECT
USING (
  creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Criadores podem criar broadcasts
CREATE POLICY "Creators can create broadcasts"
ON public.broadcasts FOR INSERT
WITH CHECK (
  creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Criadores podem atualizar seus broadcasts
CREATE POLICY "Creators can update own broadcasts"
ON public.broadcasts FOR UPDATE
USING (
  creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Service role pode gerenciar broadcasts (para Edge Function)
CREATE POLICY "Service role can manage broadcasts"
ON public.broadcasts FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- Policies para deliveries
CREATE POLICY "Creators can view deliveries of own broadcasts"
ON public.broadcast_deliveries FOR SELECT
USING (
  broadcast_id IN (
    SELECT id FROM broadcasts 
    WHERE creator_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- Destinatários podem ver suas próprias entregas
CREATE POLICY "Recipients can view own deliveries"
ON public.broadcast_deliveries FOR SELECT
USING (
  recipient_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

-- Service role pode gerenciar deliveries
CREATE POLICY "Service role can manage deliveries"
ON public.broadcast_deliveries FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- 6. Triggers para atualizar métricas

-- Função para atualizar contagem de leitura
CREATE OR REPLACE FUNCTION update_broadcast_read_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'read' AND (OLD.status IS NULL OR OLD.status != 'read') THEN
    UPDATE broadcasts 
    SET read_count = read_count + 1 
    WHERE id = NEW.broadcast_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_broadcast_read_count
AFTER UPDATE ON broadcast_deliveries
FOR EACH ROW
EXECUTE FUNCTION update_broadcast_read_count();

-- Função para atualizar contagem de unlock e receita
CREATE OR REPLACE FUNCTION update_broadcast_unlock_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'unlocked' AND (OLD.status IS NULL OR OLD.status != 'unlocked') THEN
    UPDATE broadcasts 
    SET 
      unlock_count = unlock_count + 1,
      total_revenue = total_revenue + COALESCE(NEW.paid_amount, 0)
    WHERE id = NEW.broadcast_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_broadcast_unlock_metrics
AFTER UPDATE ON broadcast_deliveries
FOR EACH ROW
EXECUTE FUNCTION update_broadcast_unlock_metrics();

-- 7. Função para contar destinatários por tipo de audiência
CREATE OR REPLACE FUNCTION count_broadcast_recipients(
  p_creator_id UUID,
  p_audience_type TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  CASE p_audience_type
    WHEN 'all_followers' THEN
      SELECT COUNT(*) INTO v_count
      FROM follows
      WHERE following_id = p_creator_id;
    
    WHEN 'active_subscribers' THEN
      SELECT COUNT(*) INTO v_count
      FROM subscriptions
      WHERE creator_id = p_creator_id AND status = 'active';
    
    WHEN 'expired_subscribers' THEN
      SELECT COUNT(*) INTO v_count
      FROM subscriptions
      WHERE creator_id = p_creator_id AND status = 'expired';
    
    ELSE
      v_count := 0;
  END CASE;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. Habilitar Realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE broadcast_deliveries;