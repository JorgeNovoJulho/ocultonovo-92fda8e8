-- ============================================================
-- CHAT BLOCK DELIVERY RPC FIX — EXTERNO
-- Objetivo: bloquear entrega visual/realtime/push entre dois usuários
-- quando qualquer lado bloqueou o outro em public.blocked_contacts.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_contacts TO authenticated;
GRANT ALL ON public.blocked_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.is_chat_blocked_between(_other_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT p.id AS profile_id, p.user_id AS auth_id
    FROM public.profiles p
    WHERE p.user_id = auth.uid() OR p.id = auth.uid()
    LIMIT 1
  ), other_user AS (
    SELECT p.id AS profile_id, p.user_id AS auth_id
    FROM public.profiles p
    WHERE p.id = _other_id OR p.user_id = _other_id
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_contacts bc, me, other_user ou
    WHERE bc.block_type = 'blocked'
      AND (
        (bc.user_id = me.profile_id AND bc.blocked_user_id = ou.profile_id)
        OR
        (bc.user_id = ou.profile_id AND bc.blocked_user_id = me.profile_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_blocked_between(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_message_blocked_between(_sender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_chat_blocked_between(_sender_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_message_blocked_between(uuid) TO authenticated;

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

ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';