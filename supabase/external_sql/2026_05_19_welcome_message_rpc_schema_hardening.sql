-- Harden do RPC de boas-vindas para schema externo:
-- 1) garante coluna messages.is_auto_reply
-- 2) recria send_welcome_message_to_user com fallback idempotente robusto

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_auto_reply boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_messages_auto_reply_conv
  ON public.messages (conversation_id, sender_id)
  WHERE is_auto_reply = true;

CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings record;
  v_sender_id uuid;
  v_username text;
  v_link text;
  v_content text;
  v_conv_id uuid;
  v_msg_id uuid;
  v_already int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings
  FROM public.oculto_welcome_message_settings
  WHERE id = 1;

  IF v_settings IS NULL OR NOT coalesce(v_settings.is_enabled, true) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_sender_id
  FROM auth.users
  WHERE lower(email) = lower(v_settings.sender_email)
  LIMIT 1;

  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(username, name, 'usuario') INTO v_username
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_username IS NULL THEN
    v_username := 'usuario';
  END IF;

  v_link := rtrim(v_settings.base_invite_url, '/') || '/' || upper(v_username);
  v_content := replace(v_settings.template, '{{username}}', v_username);
  v_content := replace(v_content, '{{referral_link}}', v_link);

  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = v_sender_id
    AND cp2.user_id = p_user_id
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at)
    VALUES (now(), now())
    RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_sender_id), (v_conv_id, p_user_id);
  ELSE
    SELECT count(*) INTO v_already
    FROM public.messages
    WHERE conversation_id = v_conv_id
      AND sender_id = v_sender_id
      AND (
        is_auto_reply = true
        OR content = v_content
        OR content LIKE '%OCULTO%'
      );

    IF v_already > 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
  VALUES (v_conv_id, v_sender_id, v_content, true, false)
  RETURNING id INTO v_msg_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid) TO authenticated, anon, service_role;