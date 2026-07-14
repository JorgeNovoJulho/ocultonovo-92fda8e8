-- =========================================================================
-- Sistema de Mensagem de Boas-Vindas Automática
-- - Tabela oculto_welcome_message_settings (template editável pelo master)
-- - RPC send_welcome_message_to_user(uuid)
-- - Trigger AFTER INSERT em profiles -> dispara para todo novo usuário
-- Idempotente.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.oculto_welcome_message_settings (
  id             integer PRIMARY KEY DEFAULT 1,
  is_enabled     boolean NOT NULL DEFAULT true,
  sender_email   text    NOT NULL DEFAULT 'ocultomaster@ocultoswing.com.br',
  template       text    NOT NULL,
  base_invite_url text   NOT NULL DEFAULT 'https://www.ocultoswing.com.br/creator-invite/',
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  CONSTRAINT oculto_welcome_message_settings_singleton CHECK (id = 1)
);

-- Seed inicial (default content) — só insere se ainda não existir
INSERT INTO public.oculto_welcome_message_settings (id, template)
VALUES (
  1,
  E'👋 *Olá, seja bem-vindo(a) @{{username}} ao OCULTO!*\n\n' ||
  E'Esperamos que goste e experimente todas as nossas novidades. ' ||
  E'Fique à vontade para responder esta mensagem e nos dizer o que achou — ' ||
  E'suas *sugestões* e *reclamações* são sempre bem-vindas.\n\n' ||
  E'⚠️ Se tiver qualquer problema, acesse no menu principal a opção *PROBLEMAS* e informe o ocorrido.\n\n' ||
  E'💸 *Divulgue para seus contatos* através do seu link exclusivo abaixo. ' ||
  E'Quando a monetização for ativada, você recebe *5% do valor da primeira assinatura* de cada indicado. ' ||
  E'Ganhe dinheiro ajudando a divulgar o OCULTO!\n\n' ||
  E'🔗 Seu link de divulgação:\n{{referral_link}}\n\n' ||
  E'Agradecemos a oportunidade de nos apresentar e desejamos *boa sorte em seus encontros*! 💕'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_welcome_message_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS welcome_settings_read ON public.oculto_welcome_message_settings;
CREATE POLICY welcome_settings_read
  ON public.oculto_welcome_message_settings
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS welcome_settings_write ON public.oculto_welcome_message_settings;
CREATE POLICY welcome_settings_write
  ON public.oculto_welcome_message_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'ocultomaster@ocultoswing.com.br'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'ocultomaster@ocultoswing.com.br'
    )
  );

-- Habilita realtime (idempotente)
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_welcome_message_settings';
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
  END;
END $$;

-- =========================================================================
-- RPC: envia welcome para um usuário (idempotente — não duplica)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings   record;
  v_sender_id  uuid;
  v_username   text;
  v_link       text;
  v_content    text;
  v_conv_id    uuid;
  v_msg_id     uuid;
  v_already    int;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF v_settings IS NULL OR NOT coalesce(v_settings.is_enabled, true) THEN
    RETURN NULL;
  END IF;

  -- Sender = ocultomaster
  SELECT id INTO v_sender_id FROM auth.users
    WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN
    RETURN NULL;
  END IF;

  -- Username do destinatário
  SELECT coalesce(username, name, 'usuario') INTO v_username
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_username IS NULL THEN
    v_username := 'usuario';
  END IF;

  v_link := rtrim(v_settings.base_invite_url, '/') || '/' || upper(v_username);

  v_content := replace(v_settings.template, '{{username}}', v_username);
  v_content := replace(v_content,            '{{referral_link}}', v_link);

  -- Evita duplicar (procura conversa existente entre sender e destinatário)
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
    -- Já existe conversa: verifica se já mandamos welcome antes
    SELECT count(*) INTO v_already
      FROM public.messages
     WHERE conversation_id = v_conv_id
       AND sender_id = v_sender_id
       AND is_auto_reply = true
       AND content LIKE '%OCULTO%';
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

-- =========================================================================
-- Trigger: AFTER INSERT ON profiles -> manda welcome
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_send_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND coalesce(NEW.is_seed, false) = false THEN
    BEGIN
      PERFORM public.send_welcome_message_to_user(NEW.user_id);
    EXCEPTION WHEN others THEN
      -- nunca quebra o cadastro
      NULL;
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
