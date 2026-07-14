-- =========================================================================
-- Fix: envio manual de boas-vindas pelo admin deve ignorar deduplicação,
-- pois usuários antigos já receberam um welcome contendo "OCULTO" e o RPC
-- retornava NULL silenciosamente (UI exibia "sucesso" sem inserir mensagem).
--
-- Mudanças:
--   1) send_welcome_message_to_user(p_user_id uuid, p_force boolean DEFAULT false)
--      - p_force = true ignora a checagem de duplicidade
--   2) admin_send_welcome_to_username(p_username text) agora chama com p_force=true
--      (envio manual pelo painel master) e RETORNA o uuid da mensagem.
--      Se for NULL, lança exceção "welcome_not_sent" para o frontend exibir erro real.
-- Idempotente: pode rodar quantas vezes precisar.
-- =========================================================================

-- 1) Recria send_welcome_message_to_user com p_force
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
  v_settings  record;
  v_sender_id uuid;
  v_username  text;
  v_link      text;
  v_content   text;
  v_conv_id   uuid;
  v_msg_id    uuid;
  v_already   int;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF v_settings IS NULL OR NOT coalesce(v_settings.is_enabled, true) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(username, name, 'usuario') INTO v_username
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_username IS NULL THEN v_username := 'usuario'; END IF;

  v_link    := rtrim(v_settings.base_invite_url, '/') || '/' || upper(v_username);
  v_content := replace(v_settings.template, '{{username}}', v_username);
  v_content := replace(v_content,            '{{referral_link}}', v_link);

  -- Conversa existente (ou cria nova)
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
  ELSIF NOT coalesce(p_force, false) THEN
    -- Só checa duplicidade em chamadas automáticas (trigger).
    SELECT count(*) INTO v_already
      FROM public.messages
     WHERE conversation_id = v_conv_id
       AND sender_id       = v_sender_id
       AND is_auto_reply   = true
       AND content LIKE '%OCULTO%';
    IF v_already > 0 THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
  VALUES (v_conv_id, v_sender_id, v_content, true, false)
  RETURNING id INTO v_msg_id;

  -- Atualiza updated_at da conversa para subir para o topo da lista
  UPDATE public.conversations SET updated_at = now() WHERE id = v_conv_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean)
  TO authenticated, anon, service_role;

-- Mantém compatibilidade com a assinatura antiga (sem p_force) chamada pelo trigger
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

-- 2) Envio manual pelo admin sempre força (ignora dedup) e devolve erro claro
CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_username(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_msg uuid;
BEGIN
  IF NOT (
    public.is_master_admin()
    OR public.has_role(auth.uid(),'admin_master')
    OR public.has_role(auth.uid(),'admin_regional')
    OR public.has_role(auth.uid(),'moderator')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RAISE EXCEPTION 'username_required';
  END IF;

  SELECT user_id INTO v_uid FROM public.profiles
   WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  IF v_uid IS NULL THEN
    SELECT id INTO v_uid FROM public.profiles
     WHERE lower(username) = lower(trim(p_username)) LIMIT 1;
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_username;
  END IF;

  v_msg := public.send_welcome_message_to_user(v_uid, true);

  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'welcome_not_sent: template desabilitado, remetente ausente ou destinatário inválido';
  END IF;

  RETURN v_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_username(text)
  TO authenticated, service_role;
