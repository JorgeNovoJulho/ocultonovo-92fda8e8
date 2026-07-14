-- ============================================================
-- 2026-05-27 — Chamar Atenção: notificação persistente para offline
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================
-- Atualiza a RPC send_attention_ping para também inserir uma
-- notificação persistente (tipo 'attention_ping') na tabela
-- public.notifications, garantindo que o destinatário receba o
-- aviso ao voltar online (mesmo que o chat estivesse fechado).
-- ============================================================

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
  v_to_profile uuid;
  v_from_username text;
  v_id uuid;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = v_from THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  -- Anti-flood: 1 ping a cada 5s por par
  IF EXISTS (
    SELECT 1 FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '5 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited';
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

  -- Notificação persistente (aparece no sino e enquanto offline)
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
  EXCEPTION WHEN OTHERS THEN
    -- Não bloquear o ping caso a tabela de notificações tenha schema diferente.
    NULL;
  END;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_attention_ping(uuid, uuid, text) TO authenticated, service_role;
