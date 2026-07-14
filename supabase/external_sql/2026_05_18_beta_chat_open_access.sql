-- ============================================================================
-- BETA CHAT OPEN ACCESS — liberar mensagens entre todos os usuários no beta
-- EXTERNO apenas. Script idempotente para copiar/colar no SQL Editor.
-- Objetivos:
-- 1) garantir SELECT/INSERT/UPDATE/DELETE corretos em public.messages
-- 2) garantir acesso de leitura/escrita aos participantes em conversation_participants
-- 3) garantir criação/uso de conversas entre quaisquer usuários autenticados
-- 4) remover o bloqueio de rate limit de chat_msg durante o beta
-- 5) garantir realtime para messages/conversations/conversation_participants
-- ============================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles p ON p.id = cp.user_id OR p.user_id = cp.user_id
    WHERE cp.conversation_id = _conversation_id
      AND (
        cp.user_id = auth.uid()
        OR p.user_id = auth.uid()
        OR p.id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_profile_id(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE (id = _profile_id OR user_id = _profile_id)
      AND user_id = auth.uid()
  ) OR _profile_id = auth.uid();
$$;

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_update_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_sender" ON public.messages;

CREATE POLICY "messages_select_participants"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "messages_insert_sender"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.owns_profile_id(sender_id)
    AND public.is_conversation_participant(conversation_id)
  );

CREATE POLICY "messages_update_participants"
  ON public.messages
  FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));

CREATE POLICY "messages_delete_sender"
  ON public.messages
  FOR DELETE
  TO authenticated
  USING (public.owns_profile_id(sender_id));

DROP POLICY IF EXISTS "conversation_participants_select_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_insert_participant" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_update_participant" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_delete_participant" ON public.conversation_participants;

CREATE POLICY "conversation_participants_select_own"
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = conversation_participants.user_id OR p.user_id = conversation_participants.user_id)
    )
    OR public.is_conversation_participant(conversation_id)
  );

CREATE POLICY "conversation_participants_insert_participant"
  ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = conversation_participants.user_id OR p.user_id = conversation_participants.user_id)
    )
    OR public.is_conversation_participant(conversation_id)
  );

CREATE POLICY "conversation_participants_update_participant"
  ON public.conversation_participants
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = conversation_participants.user_id OR p.user_id = conversation_participants.user_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = conversation_participants.user_id OR p.user_id = conversation_participants.user_id)
    )
  );

CREATE POLICY "conversation_participants_delete_participant"
  ON public.conversation_participants
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND (p.id = conversation_participants.user_id OR p.user_id = conversation_participants.user_id)
    )
  );

DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_authenticated" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_participants" ON public.conversations;

CREATE POLICY "conversations_select_participants"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(id));

CREATE POLICY "conversations_insert_authenticated"
  ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "conversations_update_participants"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(id))
  WITH CHECK (public.is_conversation_participant(id));

CREATE POLICY "conversations_delete_participants"
  ON public.conversations
  FOR DELETE
  TO authenticated
  USING (public.is_conversation_participant(id));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'plan_feature_limits'
  ) THEN
    UPDATE public.plan_feature_limits
    SET limit_count = 1000000,
        window_seconds = 86400,
        description = COALESCE(description, 'Mensagens por dia') || ' (beta liberado)'
    WHERE feature_key = 'chat_msg';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';
