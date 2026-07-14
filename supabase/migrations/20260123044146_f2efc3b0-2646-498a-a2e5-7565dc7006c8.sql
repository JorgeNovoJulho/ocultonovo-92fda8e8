
-- Tabela para gerenciar creditos internos
CREATE TABLE public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits_balance NUMERIC DEFAULT 0 CHECK (credits_balance >= 0),
  credits_frozen BOOLEAN DEFAULT false,
  frozen_reason TEXT,
  frozen_at TIMESTAMP WITH TIME ZONE,
  frozen_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Tabela para historico de presentes
CREATE TABLE public.gift_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount >= 0.50),
  credits_used NUMERIC NOT NULL CHECK (credits_used >= 0.50),
  message_id UUID REFERENCES public.messages(id),
  conversation_id UUID REFERENCES public.conversations(id),
  thank_you_type TEXT CHECK (thank_you_type IN ('message', 'photo', 'coupon')),
  thank_you_sent_at TIMESTAMP WITH TIME ZONE,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela para contatos bloqueados/silenciados
CREATE TABLE public.blocked_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL DEFAULT 'blocked' CHECK (block_type IN ('blocked', 'muted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, blocked_user_id)
);

-- Adicionar colunas para congelar saldo em profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS balance_frozen BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS balance_frozen_reason TEXT,
ADD COLUMN IF NOT EXISTS balance_frozen_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS balance_frozen_by UUID;

-- Atualizar constraint de type em transactions para incluir novos tipos
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Habilitar RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gift_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_contacts ENABLE ROW LEVEL SECURITY;

-- Policies para user_credits
CREATE POLICY "Users can view their own credits"
ON public.user_credits FOR SELECT
USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can manage credits"
ON public.user_credits FOR ALL
USING (true)
WITH CHECK (true);

-- Policies para gift_history
CREATE POLICY "Users can view their gift history"
ON public.gift_history FOR SELECT
USING (
  sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  OR receiver_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create gifts"
ON public.gift_history FOR INSERT
WITH CHECK (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their sent gifts visibility"
ON public.gift_history FOR UPDATE
USING (sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Policies para blocked_contacts
CREATE POLICY "Users can view their blocked contacts"
ON public.blocked_contacts FOR SELECT
USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage their blocked contacts"
ON public.blocked_contacts FOR ALL
USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Admins can manage credits freeze
CREATE POLICY "Admins can manage all credits"
ON public.user_credits FOR ALL
USING (is_admin(auth.uid()));

-- Habilitar Realtime para gift_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.gift_history;

-- Funcao para converter saldo em creditos
CREATE OR REPLACE FUNCTION public.convert_balance_to_credits(
  p_amount NUMERIC
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_max_convertible NUMERIC;
  v_new_balance NUMERIC;
  v_current_credits NUMERIC;
BEGIN
  -- Buscar perfil do usuario atual
  SELECT * INTO v_profile FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Perfil nao encontrado');
  END IF;
  
  -- Verificar se saldo esta congelado
  IF v_profile.balance_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seu saldo esta congelado');
  END IF;
  
  -- Validar valor minimo
  IF p_amount < 0.50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor minimo de R$ 0,50');
  END IF;
  
  -- Calcular maximo convertivel (50% do saldo)
  v_max_convertible := v_profile.balance * 0.5;
  
  IF p_amount > v_max_convertible THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Voce pode converter no maximo 50% do seu saldo',
      'max_amount', v_max_convertible
    );
  END IF;
  
  IF p_amount > v_profile.balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Saldo insuficiente');
  END IF;
  
  -- Atualizar saldo
  v_new_balance := v_profile.balance - p_amount;
  UPDATE profiles SET balance = v_new_balance WHERE id = v_profile.id;
  
  -- Inserir ou atualizar creditos
  INSERT INTO user_credits (user_id, credits_balance)
  VALUES (v_profile.id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET credits_balance = user_credits.credits_balance + p_amount,
      updated_at = now();
  
  -- Buscar saldo atual de creditos
  SELECT credits_balance INTO v_current_credits FROM user_credits WHERE user_id = v_profile.id;
  
  -- Registrar transacao
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES (v_profile.id, p_amount, 'tip', 'completed', 
    'Conversao de saldo em creditos: ' || p_amount || ' creditos');
  
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'credits_balance', v_current_credits
  );
END;
$$;

-- Funcao para enviar presente
CREATE OR REPLACE FUNCTION public.send_gift(
  p_receiver_profile_id UUID,
  p_amount NUMERIC,
  p_conversation_id UUID DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_sender_profile RECORD;
  v_receiver_profile RECORD;
  v_sender_credits RECORD;
  v_gift_id UUID;
  v_message_id UUID;
BEGIN
  -- Buscar perfil do remetente
  SELECT * INTO v_sender_profile FROM profiles WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Remetente nao encontrado');
  END IF;
  
  -- Buscar perfil do destinatario
  SELECT * INTO v_receiver_profile FROM profiles WHERE id = p_receiver_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Destinatario nao encontrado');
  END IF;
  
  -- Validar valor minimo
  IF p_amount < 0.50 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor minimo de R$ 0,50');
  END IF;
  
  -- Buscar creditos do remetente
  SELECT * INTO v_sender_credits FROM user_credits WHERE user_id = v_sender_profile.id;
  
  IF NOT FOUND OR v_sender_credits.credits_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Creditos insuficientes');
  END IF;
  
  IF v_sender_credits.credits_frozen THEN
    RETURN jsonb_build_object('success', false, 'error', 'Seus creditos estao congelados');
  END IF;
  
  -- Debitar creditos do remetente
  UPDATE user_credits 
  SET credits_balance = credits_balance - p_amount, updated_at = now()
  WHERE user_id = v_sender_profile.id;
  
  -- Creditar saldo do destinatario
  UPDATE profiles
  SET balance = balance + p_amount
  WHERE id = v_receiver_profile.id;
  
  -- Se tiver conversa, criar mensagem de presente
  IF p_conversation_id IS NOT NULL THEN
    INSERT INTO messages (conversation_id, sender_id, content, media_type)
    VALUES (p_conversation_id, auth.uid(), 
      '🎁 Presente de R$ ' || p_amount, 'gift')
    RETURNING id INTO v_message_id;
  END IF;
  
  -- Registrar presente no historico
  INSERT INTO gift_history (sender_id, receiver_id, amount, credits_used, conversation_id, message_id)
  VALUES (v_sender_profile.id, v_receiver_profile.id, p_amount, p_amount, p_conversation_id, v_message_id)
  RETURNING id INTO v_gift_id;
  
  -- Criar notificacao para o destinatario
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_receiver_profile.user_id,
    'gift_received',
    '🎁 Presente Recebido!',
    v_sender_profile.name || ' enviou R$ ' || p_amount,
    jsonb_build_object(
      'gift_id', v_gift_id,
      'from_user_id', v_sender_profile.user_id,
      'from_profile_id', v_sender_profile.id,
      'from_name', v_sender_profile.name,
      'from_avatar', v_sender_profile.avatar_url,
      'amount', p_amount
    )
  );
  
  -- Registrar transacoes
  INSERT INTO transactions (user_id, amount, type, status, description)
  VALUES 
    (v_sender_profile.id, p_amount, 'tip', 'completed', 
      'Presente enviado para ' || v_receiver_profile.name),
    (v_receiver_profile.id, p_amount, 'tip', 'completed', 
      'Presente recebido de ' || v_sender_profile.name);
  
  RETURN jsonb_build_object(
    'success', true,
    'gift_id', v_gift_id,
    'message_id', v_message_id,
    'amount', p_amount,
    'receiver_name', v_receiver_profile.name
  );
END;
$$;

-- Funcao admin para congelar saldo/creditos
CREATE OR REPLACE FUNCTION public.admin_freeze_user_balance(
  p_profile_id UUID,
  p_freeze_balance BOOLEAN DEFAULT false,
  p_freeze_credits BOOLEAN DEFAULT false,
  p_reason TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Verificar se e admin
  IF NOT is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso negado');
  END IF;
  
  -- Buscar perfil
  SELECT * INTO v_profile FROM profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;
  
  -- Atualizar congelamento de saldo
  IF p_freeze_balance THEN
    UPDATE profiles SET 
      balance_frozen = true,
      balance_frozen_reason = p_reason,
      balance_frozen_at = now(),
      balance_frozen_by = auth.uid()
    WHERE id = p_profile_id;
  ELSE
    UPDATE profiles SET 
      balance_frozen = false,
      balance_frozen_reason = NULL,
      balance_frozen_at = NULL,
      balance_frozen_by = NULL
    WHERE id = p_profile_id;
  END IF;
  
  -- Atualizar congelamento de creditos
  IF p_freeze_credits THEN
    UPDATE user_credits SET 
      credits_frozen = true,
      frozen_reason = p_reason,
      frozen_at = now(),
      frozen_by = auth.uid()
    WHERE user_id = p_profile_id;
  ELSE
    UPDATE user_credits SET 
      credits_frozen = false,
      frozen_reason = NULL,
      frozen_at = NULL,
      frozen_by = NULL
    WHERE user_id = p_profile_id;
  END IF;
  
  -- Registrar no audit log
  INSERT INTO audit_logs (admin_id, action_type, target_resource, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_freeze_balance OR p_freeze_credits THEN 'freeze_balance' ELSE 'unfreeze_balance' END,
    'profile',
    p_profile_id,
    jsonb_build_object(
      'freeze_balance', p_freeze_balance,
      'freeze_credits', p_freeze_credits,
      'reason', p_reason
    )
  );
  
  -- Criar notificacao para o usuario
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_profile.user_id,
    'balance_frozen',
    CASE WHEN p_freeze_balance OR p_freeze_credits THEN '⚠️ Saldo Congelado' ELSE '✅ Saldo Liberado' END,
    CASE WHEN p_freeze_balance OR p_freeze_credits 
      THEN 'Seu saldo foi congelado. Motivo: ' || COALESCE(p_reason, 'Nao informado')
      ELSE 'Seu saldo foi liberado.'
    END,
    jsonb_build_object('reason', p_reason)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'balance_frozen', p_freeze_balance,
    'credits_frozen', p_freeze_credits
  );
END;
$$;
