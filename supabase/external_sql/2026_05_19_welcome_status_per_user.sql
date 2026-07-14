-- =========================================================================
-- Welcome Message — Status por usuário (uso no modal "Novos Hoje" do admin)
--
-- Cria RPC `admin_welcome_status_for_users(uuid[])` que retorna, para cada
-- user_id informado, o timestamp da última mensagem de boas-vindas enviada
-- pelo remetente master (ocultomaster) — ou NULL se ainda não foi enviada.
--
-- Critério de "boas-vindas enviada":
--   - existe mensagem em public.messages
--   - sender_id = id do remetente em oculto_welcome_message_settings
--   - is_auto_reply = true
--   - o destinatário (user_id) é participante da conversa
--
-- Idempotente. Pode ser reexecutado quantas vezes precisar.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_welcome_status_for_users(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, sent_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id uuid;
BEGIN
  -- Gate de permissão (master / admin / moderator)
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

  -- Descobre o remetente master (ocultomaster) a partir das settings
  SELECT u.id
    INTO v_sender_id
    FROM auth.users u
    JOIN public.oculto_welcome_message_settings s ON s.id = 1
   WHERE lower(u.email) = lower(s.sender_email)
   LIMIT 1;

  IF v_sender_id IS NULL THEN
    -- Sem remetente configurado: ninguém recebeu
    RETURN QUERY
      SELECT t.uid AS user_id, NULL::timestamptz AS sent_at
        FROM unnest(p_user_ids) AS t(uid);
    RETURN;
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT DISTINCT t.uid AS user_id
      FROM unnest(p_user_ids) AS t(uid)
     WHERE t.uid IS NOT NULL
  ),
  welcomes AS (
    SELECT cp.user_id, MAX(m.created_at) AS sent_at
      FROM public.messages m
      JOIN public.conversation_participants cp
        ON cp.conversation_id = m.conversation_id
       AND cp.user_id <> v_sender_id
     WHERE m.sender_id     = v_sender_id
       AND m.is_auto_reply = true
       AND cp.user_id IN (SELECT user_id FROM targets)
     GROUP BY cp.user_id
  )
  SELECT t.user_id, w.sent_at
    FROM targets t
    LEFT JOIN welcomes w ON w.user_id = t.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_welcome_status_for_users(uuid[])
  TO authenticated, service_role;

-- =========================================================================
-- RPC auxiliar: envio manual pelo admin a partir do user_id
-- (o admin_send_welcome_to_username existente só aceita username; aqui
--  permitimos passar o user_id direto, útil para listas administrativas).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_user_id(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg uuid;
BEGIN
  IF NOT (
    public.is_master_admin()
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'moderator')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  v_msg := public.send_welcome_message_to_user(p_user_id, true);

  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'welcome_not_sent: template desabilitado, remetente ausente ou destinatário inválido';
  END IF;

  RETURN v_msg;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_user_id(uuid)
  TO authenticated, service_role;
