-- ============================================================
-- CHAT BLOCK NOTIFICATIONS FIX — EXTERNO
-- Objetivo: impedir notificações de mensagens quando qualquer lado
-- bloqueou o outro em public.blocked_contacts.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.blocked_contacts TO authenticated;
GRANT ALL ON public.blocked_contacts TO service_role;

CREATE OR REPLACE FUNCTION public.is_chat_blocked_pair(_user_a uuid, _user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH a AS (
    SELECT p.id AS profile_id
    FROM public.profiles p
    WHERE p.id = _user_a OR p.user_id = _user_a
    LIMIT 1
  ), b AS (
    SELECT p.id AS profile_id
    FROM public.profiles p
    WHERE p.id = _user_b OR p.user_id = _user_b
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_contacts bc, a, b
    WHERE bc.block_type = 'blocked'
      AND (
        (bc.user_id = a.profile_id AND bc.blocked_user_id = b.profile_id)
        OR
        (bc.user_id = b.profile_id AND bc.blocked_user_id = a.profile_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_chat_blocked_pair(uuid, uuid) TO authenticated, service_role;

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

  SELECT cp.user_id INTO v_recipient_id
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = NEW.conversation_id
    AND cp.user_id IS DISTINCT FROM NEW.sender_id
    AND (v_sender_profile_id IS NULL OR cp.user_id IS DISTINCT FROM v_sender_profile_id)
    AND (v_sender_auth_id IS NULL OR cp.user_id IS DISTINCT FROM v_sender_auth_id)
  LIMIT 1;

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
        'sender_id', NEW.sender_id
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

CREATE OR REPLACE FUNCTION public.send_attention_ping(
  p_to_user_id uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid := auth.uid();
  v_from_profile uuid;
  v_from_username text;
  v_to_profile uuid;
  v_id uuid;
  v_attempts_5min int;
  v_response_exists boolean;
  v_self_profile_ids uuid[];
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = v_from THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;
  IF public.is_chat_blocked_pair(v_from, p_to_user_id) THEN
    RAISE EXCEPTION 'chat_blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '15 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT COUNT(*) INTO v_attempts_5min
    FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '5 minutes';

  IF v_attempts_5min >= 5 THEN
    SELECT ARRAY(SELECT id FROM public.profiles WHERE user_id = p_to_user_id)
      INTO v_self_profile_ids;

    SELECT EXISTS (
      SELECT 1
      FROM public.messages m
      WHERE m.created_at > now() - interval '5 minutes'
        AND (
          m.sender_id = p_to_user_id
          OR m.sender_id = ANY(v_self_profile_ids)
        )
    ) INTO v_response_exists;

    IF NOT v_response_exists THEN
      RAISE EXCEPTION 'lockout_5min';
    END IF;
  END IF;

  SELECT id, COALESCE(username, name, '')
    INTO v_from_profile, v_from_username
    FROM public.profiles WHERE user_id = v_from LIMIT 1;
  SELECT id INTO v_to_profile
    FROM public.profiles WHERE user_id = p_to_user_id LIMIT 1;

  INSERT INTO public.oculto_attention_pings
    (from_user_id, to_user_id, from_profile_id, to_profile_id, conversation_id, message)
  VALUES (v_from, p_to_user_id, v_from_profile, v_to_profile, p_conversation_id, p_message)
  RETURNING id INTO v_id;

  BEGIN
    INSERT INTO public.notifications
      (user_id, actor_id, type, title, body, data, is_read)
    VALUES (
      p_to_user_id,
      v_from,
      'attention_ping',
      'Chamada de atenção',
      COALESCE('@' || NULLIF(v_from_username, ''), 'Alguém') || ' está chamando sua atenção',
      jsonb_build_object(
        'actor_id', v_from,
        'actor_profile_id', v_from_profile,
        'actor_username', v_from_username,
        'conversation_id', p_conversation_id,
        'ping_id', v_id
      ),
      false
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_attention_ping(uuid, uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';