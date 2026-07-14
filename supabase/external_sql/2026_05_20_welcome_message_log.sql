-- =========================================================================
-- 2026-05-20 — Welcome Message LOG (fonte de verdade para "já enviada?")
--
-- Cria public.oculto_welcome_message_log para registrar TODO envio de
-- mensagem de boas-vindas, com índice único por destinatário. Faz backfill
-- a partir das mensagens já enviadas pelo remetente master em conversas
-- 1-1 (mesmo que is_auto_reply seja false), corrigindo casos antigos.
--
-- Substitui a função admin_welcome_status_for_users para ler do log e
-- atualiza send_welcome_message_to_user para gravar no log a cada envio.
--
-- Idempotente — pode ser reexecutado.
-- =========================================================================

-- 1) Tabela de log
CREATE TABLE IF NOT EXISTS public.oculto_welcome_message_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  conversation_id uuid,
  message_id      uuid,
  sender_id       uuid,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL DEFAULT 'rpc'
);

CREATE UNIQUE INDEX IF NOT EXISTS oculto_welcome_message_log_user_id_uk
  ON public.oculto_welcome_message_log (user_id);

CREATE INDEX IF NOT EXISTS oculto_welcome_message_log_sent_at_idx
  ON public.oculto_welcome_message_log (sent_at DESC);

ALTER TABLE public.oculto_welcome_message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS welcome_log_read ON public.oculto_welcome_message_log;
CREATE POLICY welcome_log_read
  ON public.oculto_welcome_message_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
    OR user_id = auth.uid()
  );

-- writes apenas via SECURITY DEFINER

-- 2) BACKFILL — todo destinatário que já recebeu mensagem do remetente master
--    em uma conversa 1-1 entra no log com o sent_at da primeira mensagem.
DO $backfill$
DECLARE
  v_sender_id uuid;
BEGIN
  SELECT u.id INTO v_sender_id
    FROM auth.users u
    JOIN public.oculto_welcome_message_settings s ON s.id = 1
   WHERE lower(u.email) = lower(s.sender_email)
   LIMIT 1;

  IF v_sender_id IS NULL THEN
    RAISE NOTICE 'Welcome log backfill: remetente master não encontrado, pulando.';
    RETURN;
  END IF;

  INSERT INTO public.oculto_welcome_message_log
    (user_id, conversation_id, message_id, sender_id, sent_at, source)
  SELECT
    recipient.user_id,
    first_msg.conversation_id,
    first_msg.id,
    v_sender_id,
    first_msg.created_at,
    'backfill'
  FROM (
    -- conversas 1-1 envolvendo o remetente master + 1 destinatário
    SELECT m.conversation_id, MIN(m.created_at) AS first_at
      FROM public.messages m
     WHERE m.sender_id = v_sender_id
     GROUP BY m.conversation_id
  ) c
  JOIN LATERAL (
    SELECT id, conversation_id, created_at
      FROM public.messages
     WHERE conversation_id = c.conversation_id
       AND sender_id = v_sender_id
     ORDER BY created_at ASC
     LIMIT 1
  ) first_msg ON true
  JOIN LATERAL (
    SELECT cp.user_id
      FROM public.conversation_participants cp
     WHERE cp.conversation_id = c.conversation_id
       AND cp.user_id <> v_sender_id
     LIMIT 1
  ) recipient ON true
  WHERE recipient.user_id IS NOT NULL
  ON CONFLICT (user_id) DO NOTHING;
END
$backfill$;

-- 3) RPC de status — agora lê do log
CREATE OR REPLACE FUNCTION public.admin_welcome_status_for_users(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, sent_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_master_admin()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT t.uid AS user_id
      FROM unnest(p_user_ids) AS t(uid)
     WHERE t.uid IS NOT NULL
  )
  SELECT t.user_id, l.sent_at
    FROM targets t
    LEFT JOIN public.oculto_welcome_message_log l
      ON l.user_id = t.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_welcome_status_for_users(uuid[])
  TO authenticated, service_role;

-- 4) Atualiza send_welcome_message_to_user para gravar no log a cada envio.
--    Mantém assinatura (uuid, boolean) — a forma legacy (uuid) é wrapper.
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
  IF NOT FOUND OR NOT COALESCE(v_settings.enabled, true) THEN
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

  -- procura conversa 1-1 entre remetente master e destinatário
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
        -- garantir log mesmo para envios antigos
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
