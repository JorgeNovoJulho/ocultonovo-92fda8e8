-- =========================================================================
-- 2026-05-20 — HOTFIX FINAL: Welcome Message
-- 1) Restaura substituição de {{username}} e {{referral_link}} no template
--    (a versão anterior gravava o template cru, sem placeholders).
-- 2) Reinstala o trigger AFTER INSERT em profiles (caso tenha sido perdido).
-- 3) Garante backfill: chama o RPC para todo profile já existente sem log.
-- Idempotente — pode ser reexecutado.
-- =========================================================================

-- 1) Recria a função com substituição de placeholders
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
  v_username  text;
  v_link      text;
  v_content   text;
  v_msg_id    uuid;
  v_existing  uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF NOT FOUND OR NOT COALESCE(v_settings.is_enabled, true) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(v_settings.template, '') = '' THEN
    RETURN NULL;
  END IF;

  -- Remetente master
  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  -- Username/Nome do destinatário (tolerante a perfis recém-criados)
  SELECT COALESCE(NULLIF(username, ''), NULLIF(name, ''), 'usuario')
    INTO v_username
    FROM public.profiles
   WHERE user_id = p_user_id
   LIMIT 1;
  IF v_username IS NULL THEN v_username := 'usuario'; END IF;

  v_link := rtrim(COALESCE(v_settings.base_invite_url, 'https://www.ocultoswing.com.br/creator-invite/'), '/')
            || '/' || upper(v_username);

  v_content := replace(v_settings.template, '{{username}}',      v_username);
  v_content := replace(v_content,           '{{referral_link}}', v_link);

  -- Conversa 1-1
  SELECT cp1.conversation_id
    INTO v_conv_id
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
    IF NOT COALESCE(p_force, false) THEN
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
    SET sent_at         = EXCLUDED.sent_at,
        conversation_id = EXCLUDED.conversation_id,
        message_id      = EXCLUDED.message_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean)
  TO authenticated, anon, service_role;

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

-- 2) Trigger AFTER INSERT em profiles (reinstala)
CREATE OR REPLACE FUNCTION public.trg_send_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND COALESCE(NEW.is_seed, false) = false THEN
    BEGIN
      PERFORM public.send_welcome_message_to_user(NEW.user_id, false);
    EXCEPTION WHEN others THEN
      NULL; -- nunca quebra o cadastro
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_send_welcome_message ON public.profiles;
CREATE TRIGGER profiles_send_welcome_message
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_send_welcome_message();

-- 3) RPC "ensure" idempotente para o cliente chamar no /feed (auth.uid())
CREATE OR REPLACE FUNCTION public.ensure_welcome_message_for_me()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  -- Se já está no log, não faz nada
  IF EXISTS (SELECT 1 FROM public.oculto_welcome_message_log WHERE user_id = v_uid) THEN
    RETURN NULL;
  END IF;
  RETURN public.send_welcome_message_to_user(v_uid, false);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_welcome_message_for_me() TO authenticated;

-- 4) Backfill final: envia welcome para qualquer profile humano sem log
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.user_id
      FROM public.profiles p
      LEFT JOIN public.oculto_welcome_message_log l ON l.user_id = p.user_id
     WHERE p.user_id IS NOT NULL
       AND COALESCE(p.is_seed, false) = false
       AND l.user_id IS NULL
  LOOP
    BEGIN
      PERFORM public.send_welcome_message_to_user(r.user_id, false);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END
$backfill$;

NOTIFY pgrst, 'reload schema';
