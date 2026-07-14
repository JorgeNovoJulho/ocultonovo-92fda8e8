-- ==========================================================================
-- 2026_05_27_attention_ping_v3_cooldown_and_lockout.sql
-- Endurece `send_attention_ping`:
--   • Cooldown: 15s entre chamados do mesmo remetente para o mesmo destinatário
--   • Lockout: 5 tentativas em 5 min SEM resposta do destinatário ⇒ bloqueia 5 min
--     (resposta = qualquer mensagem do destinatário para o remetente no período)
-- Mantém: notificação persistente em `notifications`, anti-flood, realtime.
-- Idempotente — cole no SQL Editor do Supabase EXTERNO.
-- ==========================================================================

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

  -- Cooldown 15s
  IF EXISTS (
    SELECT 1 FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '15 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  -- Lockout: 5 tentativas em 5 min sem resposta ⇒ bloqueia
  SELECT COUNT(*) INTO v_attempts_5min
    FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '5 minutes';

  IF v_attempts_5min >= 5 THEN
    -- Verifica se o destinatário respondeu (qualquer mensagem dele→remetente nos últimos 5 min)
    -- conversation_participants pode armazenar user_id como auth.uid OU profile.id
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

  -- Notificação persistente (sino)
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
