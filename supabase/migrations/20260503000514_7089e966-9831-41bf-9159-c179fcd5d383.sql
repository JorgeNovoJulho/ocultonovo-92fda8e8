
-- 1. Preço de desbloqueio de DM no perfil do criador
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dm_unlock_price numeric(10,2) DEFAULT 0 NOT NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_dm_unlock_price_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dm_unlock_price_check
  CHECK (dm_unlock_price >= 0 AND dm_unlock_price <= 9999.99);

-- 2. Tabela de desbloqueios de chat (1 unlock = acesso permanente àquele criador)
CREATE TABLE IF NOT EXISTS public.chat_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unlocker_user_id uuid NOT NULL,
  creator_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text,
  transaction_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(unlocker_user_id, creator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_unlocks_unlocker
  ON public.chat_unlocks (unlocker_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_unlocks_creator
  ON public.chat_unlocks (creator_profile_id);

ALTER TABLE public.chat_unlocks ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê seus desbloqueios; criador vê quem desbloqueou ele
CREATE POLICY "View own chat unlocks"
ON public.chat_unlocks FOR SELECT
USING (
  unlocker_user_id = auth.uid()
  OR creator_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- INSERT: apenas via RPC backend (admin master fallback)
CREATE POLICY "Admin master can insert chat unlocks"
ON public.chat_unlocks FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.user_roles
          WHERE user_id = auth.uid() AND role = 'admin_master')
);

-- 3. Função canônica para validar acesso ao chat
CREATE OR REPLACE FUNCTION public.has_chat_unlocked(_creator_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- Próprio criador
    EXISTS (SELECT 1 FROM public.profiles
            WHERE id = _creator_profile_id AND user_id = auth.uid())
    -- Criador não cobra
    OR (SELECT COALESCE(dm_unlock_price, 0) = 0
        FROM public.profiles WHERE id = _creator_profile_id)
    -- Já desbloqueou (e não expirou)
    OR EXISTS (
      SELECT 1 FROM public.chat_unlocks
      WHERE creator_profile_id = _creator_profile_id
        AND unlocker_user_id = auth.uid()
        AND (expires_at IS NULL OR expires_at > now())
    )
    -- Assinante ativo do criador
    OR public.has_active_subscription(_creator_profile_id);
$$;

GRANT EXECUTE ON FUNCTION public.has_chat_unlocked(uuid) TO authenticated;

-- 4. RPC para registrar desbloqueio (chamada pelo backend após pagamento confirmado)
-- Stub: integração com gateway (Stripe/PIX) deve invocar via service role.
CREATE OR REPLACE FUNCTION public.register_chat_unlock(
  _creator_profile_id uuid,
  _amount numeric,
  _payment_method text DEFAULT NULL,
  _transaction_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_price numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(dm_unlock_price, 0) INTO v_price
  FROM public.profiles WHERE id = _creator_profile_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;

  IF _amount < v_price THEN
    RAISE EXCEPTION 'Insufficient amount: required %, paid %', v_price, _amount;
  END IF;

  INSERT INTO public.chat_unlocks
    (unlocker_user_id, creator_profile_id, amount_paid, payment_method, transaction_id)
  VALUES
    (auth.uid(), _creator_profile_id, _amount, _payment_method, _transaction_id)
  ON CONFLICT (unlocker_user_id, creator_profile_id)
    DO UPDATE SET amount_paid = EXCLUDED.amount_paid,
                  payment_method = EXCLUDED.payment_method,
                  transaction_id = EXCLUDED.transaction_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_chat_unlock(uuid,numeric,text,uuid) TO authenticated;

-- 5. RESTRICTIVE policy: bloqueia envio de mensagem para criador com preço, sem unlock
-- (não interfere em chats gratuitos — só nega quando preço > 0 e sem desbloqueio)
DROP POLICY IF EXISTS "Block messages without chat unlock" ON public.messages;
CREATE POLICY "Block messages without chat unlock"
ON public.messages
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
  -- Permite se TODOS os outros participantes da conversa estão acessíveis ao remetente
  NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    JOIN public.profiles pr ON pr.user_id = cp.user_id
    WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id <> auth.uid()
      AND COALESCE(pr.dm_unlock_price, 0) > 0
      AND NOT public.has_chat_unlocked(pr.id)
  )
);
