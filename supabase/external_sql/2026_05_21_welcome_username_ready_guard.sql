-- =========================================================================
-- 2026-05-21 — HOTFIX: Welcome message com link errado (/USUARIO)
-- Causa: trigger AFTER INSERT em profiles disparava ANTES do username
--        ser persistido (o cadastro insere a row vazia e depois atualiza).
--        Resultado: fallback 'usuario' e link /creator-invite/USUARIO.
--
-- Correção:
--  1) RPC send_welcome_message_to_user(uuid, boolean) passa a EXIGIR
--     username real (não-nulo, não-vazio, != 'usuario'). Sem username,
--     não envia e NÃO grava log — fica pendente para reenvio quando
--     o username chegar.
--  2) Novo trigger AFTER UPDATE em profiles dispara o envio assim que
--     o username é preenchido pela primeira vez (e ainda não há log).
--  3) Backfill: detecta mensagens já enviadas com link errado
--     (terminando em /USUARIO), apaga a mensagem + o log, e reenvia
--     com o username correto.
-- Idempotente.
-- =========================================================================

-- 1) RPC com guarda de username real
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
  IF COALESCE(v_settings.template, '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  -- GUARDA: exige username real do perfil. Sem isso, sai sem enviar
  -- e sem gravar log — o trigger AFTER UPDATE fará o envio quando
  -- o username for finalmente persistido.
  SELECT NULLIF(btrim(username), '')
    INTO v_username
    FROM public.profiles
   WHERE user_id = p_user_id
   LIMIT 1;

  IF v_username IS NULL OR lower(v_username) IN ('usuario', 'usuário', 'user') THEN
    RETURN NULL;
  END IF;

  v_link := rtrim(COALESCE(v_settings.base_invite_url,
                           'https://www.ocultoswing.com.br/creator-invite/'), '/')
            || '/' || upper(v_username);

  v_content := replace(v_settings.template, '{{username}}',      v_username);
  v_content := replace(v_content,           '{{referral_link}}', v_link);

  SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
   WHERE cp1.user_id = v_sender_id
     AND cp2.user_id = p_user_id
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at)
    VALUES (now(), now()) RETURNING id INTO v_conv_id;
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
    SET sent_at = EXCLUDED.sent_at,
        conversation_id = EXCLUDED.conversation_id,
        message_id = EXCLUDED.message_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean)
  TO authenticated, anon, service_role;

-- 2) Trigger AFTER UPDATE: dispara quando username vira "real"
CREATE OR REPLACE FUNCTION public.trg_send_welcome_on_username_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new text := NULLIF(btrim(NEW.username), '');
  v_old text := NULLIF(btrim(COALESCE(OLD.username, '')), '');
BEGIN
  IF NEW.user_id IS NULL OR COALESCE(NEW.is_seed, false) THEN
    RETURN NEW;
  END IF;
  -- Só age quando username deixou de ser vazio/inválido
  IF v_new IS NULL OR lower(v_new) IN ('usuario','usuário','user') THEN
    RETURN NEW;
  END IF;
  IF v_old IS NOT NULL AND lower(v_old) NOT IN ('usuario','usuário','user') THEN
    RETURN NEW; -- já tinha username válido antes
  END IF;
  -- Já enviado? não reenvia
  IF EXISTS (SELECT 1 FROM public.oculto_welcome_message_log WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.send_welcome_message_to_user(NEW.user_id, false);
  EXCEPTION WHEN others THEN NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_send_welcome_on_username_ready ON public.profiles;
CREATE TRIGGER profiles_send_welcome_on_username_ready
  AFTER UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_send_welcome_on_username_ready();

-- 3) Conserta as mensagens já enviadas com o link errado (/USUARIO)
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT l.user_id, l.message_id, l.conversation_id
      FROM public.oculto_welcome_message_log l
      JOIN public.messages m ON m.id = l.message_id
     WHERE m.content ILIKE '%/creator-invite/USUARIO%'
        OR m.content ILIKE '%@usuario%'
  LOOP
    BEGIN
      DELETE FROM public.messages WHERE id = r.message_id;
      DELETE FROM public.oculto_welcome_message_log WHERE user_id = r.user_id;
      PERFORM public.send_welcome_message_to_user(r.user_id, true);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END
$backfill$;

NOTIFY pgrst, 'reload schema';
