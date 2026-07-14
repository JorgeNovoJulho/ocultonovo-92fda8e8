-- =========================================================================
-- 2026-05-20 — Corrige ambiguidade "send_welcome_message_to_user(uuid, boolean) is not unique"
--
-- Causa: existem múltiplas overloads no banco (algumas com DEFAULTs antigos +
-- wrapper novo), o que torna a resolução de (uuid, boolean) ambígua.
--
-- Solução:
--   1) Dropa TODAS as overloads conhecidas de send_welcome_message_to_user.
--   2) Recria APENAS a versão canônica (uuid, boolean, text) — sem DEFAULTs.
--   3) Atualiza admin_send_welcome_to_username para chamar a 3-arg explicitamente
--      com p_source='admin' e casts explícitos (evita ambiguidade futura).
--   4) Atualiza trg_send_welcome_message e ensure_welcome_message_for_me para
--      continuarem chamando a 3-arg explicitamente (já estavam OK; reforça).
-- Idempotente.
-- =========================================================================

-- 1) Drop de todas as overloads possíveis
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid, boolean);
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid);

-- 2) Recria APENAS a versão canônica 3-arg (sem DEFAULTs)
CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(
  p_user_id uuid,
  p_force   boolean,
  p_source  text
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
  v_username  text;
  v_link      text;
  v_content   text;
  v_msg_id    uuid;
  v_existing  uuid;
  v_src       text := COALESCE(NULLIF(p_source, ''), 'rpc');
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF NOT FOUND OR NOT COALESCE(v_settings.is_enabled, true) THEN RETURN NULL; END IF;
  IF COALESCE(v_settings.template, '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN RETURN NULL; END IF;

  SELECT COALESCE(NULLIF(username, ''), NULLIF(name, ''), 'usuario')
    INTO v_username FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_username IS NULL THEN v_username := 'usuario'; END IF;

  v_link := rtrim(COALESCE(v_settings.base_invite_url, 'https://www.ocultoswing.com.br/creator-invite/'), '/')
            || '/' || upper(v_username);

  v_content := replace(v_settings.template, '{{username}}',      v_username);
  v_content := replace(v_content,           '{{referral_link}}', v_link);

  SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
   WHERE cp1.user_id = v_sender_id AND cp2.user_id = p_user_id
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at) VALUES (now(), now())
    RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_sender_id), (v_conv_id, p_user_id);
  ELSE
    IF NOT COALESCE(p_force, false) THEN
      SELECT id INTO v_existing FROM public.messages
       WHERE conversation_id = v_conv_id AND sender_id = v_sender_id
         AND is_auto_reply = true LIMIT 1;
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
  VALUES (v_conv_id, v_sender_id, v_content, true, false) RETURNING id INTO v_msg_id;

  UPDATE public.conversations SET updated_at = now() WHERE id = v_conv_id;

  INSERT INTO public.oculto_welcome_message_log
    (user_id, conversation_id, message_id, sender_id, sent_at, source)
  VALUES (p_user_id, v_conv_id, v_msg_id, v_sender_id, now(), v_src)
  ON CONFLICT (user_id) DO UPDATE
    SET sent_at         = EXCLUDED.sent_at,
        conversation_id = EXCLUDED.conversation_id,
        message_id      = EXCLUDED.message_id,
        source          = EXCLUDED.source;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean, text)
  TO authenticated, anon, service_role;

-- 3) Trigger usa 3-arg com casts explícitos
CREATE OR REPLACE FUNCTION public.trg_send_welcome_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND COALESCE(NEW.is_seed, false) = false THEN
    BEGIN
      PERFORM public.send_welcome_message_to_user(NEW.user_id::uuid, false::boolean, 'trigger'::text);
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_send_welcome_message ON public.profiles;
CREATE TRIGGER profiles_send_welcome_message
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_send_welcome_message();

-- 4) ensure usa 3-arg com casts explícitos
CREATE OR REPLACE FUNCTION public.ensure_welcome_message_for_me()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.oculto_welcome_message_log WHERE user_id = v_uid) THEN
    RETURN NULL;
  END IF;
  RETURN public.send_welcome_message_to_user(v_uid::uuid, false::boolean, 'ensure'::text);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_welcome_message_for_me() TO authenticated;

-- 5) admin_send_welcome_to_username — chama 3-arg com source='admin' e casts
CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_username(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_msg uuid;
  v_is_admin boolean := false;
BEGIN
  -- Permissão: master admin OU roles administrativas (tolerante a ausência)
  BEGIN
    SELECT public._is_master_admin() INTO v_is_admin;
  EXCEPTION WHEN others THEN v_is_admin := false; END;

  IF NOT v_is_admin THEN
    BEGIN
      v_is_admin := public.has_role(auth.uid(),'admin_master'::app_role)
                 OR public.has_role(auth.uid(),'admin_regional'::app_role)
                 OR public.has_role(auth.uid(),'moderator'::app_role);
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

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

  -- Chamada inequívoca à 3-arg com casts explícitos
  v_msg := public.send_welcome_message_to_user(v_uid::uuid, true::boolean, 'admin'::text);

  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'welcome_not_sent: template desabilitado, remetente ausente ou destinatário inválido';
  END IF;

  RETURN v_msg;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_username(text)
  TO authenticated, service_role;

-- 6) admin_send_welcome_to_user_id (usado por AdminUsersListModal) — também na 3-arg
CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_user_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg uuid;
  v_is_admin boolean := false;
BEGIN
  BEGIN
    SELECT public._is_master_admin() INTO v_is_admin;
  EXCEPTION WHEN others THEN v_is_admin := false; END;

  IF NOT v_is_admin THEN
    BEGIN
      v_is_admin := public.has_role(auth.uid(),'admin_master'::app_role)
                 OR public.has_role(auth.uid(),'admin_regional'::app_role)
                 OR public.has_role(auth.uid(),'moderator'::app_role);
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;

  v_msg := public.send_welcome_message_to_user(p_user_id::uuid, true::boolean, 'admin'::text);

  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'welcome_not_sent: template desabilitado, remetente ausente ou destinatário inválido';
  END IF;
  RETURN v_msg;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_user_id(uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
