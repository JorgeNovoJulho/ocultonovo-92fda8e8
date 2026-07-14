-- =========================================================================
-- 2026-05-20 — HOTFIX: send_welcome_message_to_user
-- A versão anterior referenciava v_settings.enabled, mas a coluna correta
-- em oculto_welcome_message_settings é is_enabled. Isso quebrava o envio
-- com erro: record "v_settings" has no field "enabled".
-- Idempotente.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(
  p_user_id uuid,
  p_force   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  public.oculto_welcome_message_settings%ROWTYPE;
  v_sender_id uuid;
  v_conv_id   uuid;
  v_content   text;
  v_msg_id    uuid;
  v_existing  uuid;
BEGIN
  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF NOT FOUND OR NOT COALESCE(v_settings.is_enabled, true) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  v_content := COALESCE(v_settings.template, '');
  IF v_content = '' THEN
    RETURN NULL;
  END IF;

  SELECT cp1.conversation_id
    INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
   WHERE cp1.user_id = v_sender_id
     AND cp2.user_id = p_user_id
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at) VALUES (now()) RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_sender_id), (v_conv_id, p_user_id);
  ELSE
    IF NOT p_force THEN
      SELECT id INTO v_existing
        FROM public.messages
       WHERE conversation_id = v_conv_id
         AND sender_id       = v_sender_id
         AND is_auto_reply   = true
       LIMIT 1;
      IF v_existing IS NOT NULL THEN
        INSERT INTO public.oculto_welcome_message_log
          (user_id, conversation_id, message_id, sender_id, sent_at, source)
        VALUES (p_user_id, v_conv_id, v_existing, v_sender_id, now(), 'idempotent')
        ON CONFLICT (user_id) DO NOTHING;
        RETURN v_existing;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
  VALUES (v_conv_id, v_sender_id, v_content, true, false)
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations SET updated_at = now() WHERE id = v_conv_id;

  INSERT INTO public.oculto_welcome_message_log
    (user_id, conversation_id, message_id, sender_id, sent_at, source)
  VALUES (p_user_id, v_conv_id, v_msg_id, v_sender_id, now(), 'rpc')
  ON CONFLICT (user_id) DO UPDATE
    SET sent_at = EXCLUDED.sent_at,
        conversation_id = EXCLUDED.conversation_id,
        message_id = EXCLUDED.message_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean)
  TO authenticated, anon, service_role;

-- Wrapper legado
CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.send_welcome_message_to_user(p_user_id, false);
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid)
  TO authenticated, anon, service_role;
