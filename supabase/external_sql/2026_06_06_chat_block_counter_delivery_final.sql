-- ============================================================
-- CHAT BLOCK — ENTREGA + CONTADOR FINAL (EXTERNO)
-- Objetivo: quando A bloqueia B, nenhum lado deve receber mensagens,
-- notificações, push ou incremento de contador até o desbloqueio.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_contacts TO authenticated;
GRANT ALL ON public.blocked_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.is_chat_blocked_pair(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a_ids AS (
    SELECT _user_a AS id
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = _user_a OR p.user_id = _user_a
    UNION
    SELECT p.user_id FROM public.profiles p WHERE p.id = _user_a OR p.user_id = _user_a
  ), b_ids AS (
    SELECT _user_b AS id
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = _user_b OR p.user_id = _user_b
    UNION
    SELECT p.user_id FROM public.profiles p WHERE p.id = _user_b OR p.user_id = _user_b
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_contacts bc
    WHERE bc.block_type = 'blocked'
      AND (
        (bc.user_id IN (SELECT id FROM a_ids) AND bc.blocked_user_id IN (SELECT id FROM b_ids))
        OR
        (bc.user_id IN (SELECT id FROM b_ids) AND bc.blocked_user_id IN (SELECT id FROM a_ids))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_blocked_pair(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_chat_blocked_between(_other_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_chat_blocked_pair(auth.uid(), _other_id);
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_blocked_between(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.chat_message_peer_id(_conversation_id uuid, _sender_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sender_ids AS (
    SELECT _sender_id AS id
    UNION
    SELECT p.id FROM public.profiles p WHERE p.id = _sender_id OR p.user_id = _sender_id
    UNION
    SELECT p.user_id FROM public.profiles p WHERE p.id = _sender_id OR p.user_id = _sender_id
  )
  SELECT cp.user_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = _conversation_id
    AND cp.user_id NOT IN (SELECT id FROM sender_ids)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.chat_message_peer_id(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_blocked_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_peer_id uuid;
BEGIN
  v_peer_id := public.chat_message_peer_id(NEW.conversation_id, NEW.sender_id);

  IF v_peer_id IS NOT NULL AND public.is_chat_blocked_pair(NEW.sender_id, v_peer_id) THEN
    RAISE EXCEPTION 'chat_blocked';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_blocked_chat_message ON public.messages;
CREATE TRIGGER trg_prevent_blocked_chat_message
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_blocked_chat_message();

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
CREATE POLICY "messages_select_participants"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    AND (
      public.owns_profile_id(sender_id)
      OR NOT public.is_chat_blocked_pair(auth.uid(), sender_id)
    )
  );

CREATE OR REPLACE FUNCTION public.notify_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name text;
  v_sender_profile_id uuid;
  v_sender_auth_id uuid;
  v_recipient_id uuid;
BEGIN
  SELECT p.name, p.id, p.user_id
    INTO v_sender_name, v_sender_profile_id, v_sender_auth_id
  FROM public.profiles p
  WHERE p.id = NEW.sender_id OR p.user_id = NEW.sender_id
  LIMIT 1;

  v_recipient_id := public.chat_message_peer_id(NEW.conversation_id, NEW.sender_id);

  IF v_recipient_id IS NOT NULL
     AND v_recipient_id IS DISTINCT FROM NEW.sender_id
     AND NOT public.is_chat_blocked_pair(NEW.sender_id, v_recipient_id)
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_recipient_id,
      'new_message',
      'Nova mensagem',
      COALESCE(v_sender_name, 'Alguém') || ' enviou uma mensagem',
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id,
        'sender_id', COALESCE(v_sender_auth_id, v_sender_profile_id, NEW.sender_id)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_new_message ON public.messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_message();

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.blocked_contacts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'blocked_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_contacts;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';