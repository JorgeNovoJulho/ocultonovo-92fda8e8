-- ================================================
-- FASE 5.15: FUNÇÕES DE SEGURANÇA ESSENCIAIS (SIMPLIFICADO)
-- ================================================

-- 1. Função auxiliar para verificar permissões de admin
CREATE OR REPLACE FUNCTION public.get_admin_role(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM admin_staff WHERE user_id = p_user_id AND is_active = true LIMIT 1;
$$;

-- 2. Função para verificar bloqueios
CREATE OR REPLACE FUNCTION public.is_blocked_by(blocker_id uuid, blocked_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_contacts
    WHERE user_id = blocker_id AND blocked_user_id = blocked_id
  );
$$;

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications(user_id, is_read) WHERE is_read = false;

-- 4. Corrigir políticas de mensagens
DROP POLICY IF EXISTS "Users can view conversation messages" ON public.messages;
CREATE POLICY "Users can view conversation messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid() OR 
    public.is_conversation_participant(conversation_id, auth.uid())
  );

-- 5. Admins podem ver todas as mensagens
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages" ON public.messages
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));