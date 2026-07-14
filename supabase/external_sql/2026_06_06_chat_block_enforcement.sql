-- ============================================================
-- CHAT BLOCK ENFORCEMENT
-- Quando A bloqueia B (ou B bloqueia A), as mensagens entre eles
-- somem para o OUTRO lado, mas o remetente continua vendo a própria
-- mensagem (UX "enviou mas não chegou"). Desbloquear restaura tudo
-- automaticamente (RLS reavalia em tempo real).
-- Idempotente.
-- ============================================================

-- Helper SECURITY DEFINER para checar bloqueio bidirecional
-- contornando RLS de blocked_contacts (que só expõe rows do próprio user).
CREATE OR REPLACE FUNCTION public.is_message_blocked_between(_sender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_contacts bc
    JOIN public.profiles me ON me.user_id = auth.uid()
    WHERE bc.block_type = 'blocked'
      AND (
        (bc.user_id = me.id AND bc.blocked_user_id = _sender_id)
        OR
        (bc.user_id = _sender_id AND bc.blocked_user_id = me.id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_message_blocked_between(uuid) TO authenticated;

-- Recria SELECT policy de messages incluindo filtro de bloqueio.
-- O remetente SEMPRE vê a própria mensagem; o outro lado deixa de ver.
DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;

CREATE POLICY "messages_select_participants"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    AND (
      public.owns_profile_id(sender_id)
      OR NOT public.is_message_blocked_between(sender_id)
    )
  );

NOTIFY pgrst, 'reload schema';
