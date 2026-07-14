-- =========================================================================
-- 2026-06-19 — FIX: oculto_survey_finalize_reward
-- Erro original: "operator does not exist: text = uuid"
-- Causa: xp_transactions.reference_id e/ou profiles.user_id são text
--        e estavam sendo comparados direto com uuid.
-- Solução: casts explícitos em todas as comparações sensíveis.
--
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Sobrescreve a função anterior com a mesma assinatura.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.oculto_survey_finalize_reward(
  p_survey_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey        public.oculto_user_surveys%ROWTYPE;
  v_caller        uuid := auth.uid();
  v_is_master     boolean := false;
  v_profile_id    uuid;
  v_new_balance   integer;
  v_xp_amount     integer := 200;
  v_already       boolean := false;
  v_msg_sent      boolean := false;
  v_msg_existing  uuid;
  v_msg_id        uuid;
  v_master_uid    uuid;
  v_master_text   text := 'Obrigado por contribuir com a evolução do Oculto.' || E'\n' ||
                          'Sua opinião é importante para construirmos algo maior.';
  v_conv_id       uuid;
BEGIN
  IF p_survey_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_survey_id');
  END IF;

  SELECT * INTO v_survey
    FROM public.oculto_user_surveys
   WHERE id = p_survey_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'survey_not_found');
  END IF;

  BEGIN
    v_is_master := COALESCE(public.is_admin_master(), false);
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF v_caller IS NULL OR (v_caller <> v_survey.user_id AND NOT v_is_master) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authorized');
  END IF;

  IF v_survey.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'survey_not_completed', 'status', v_survey.status);
  END IF;

  -- profiles.user_id pode ser TEXT em alguns ambientes -> cast explícito
  SELECT id INTO v_profile_id
    FROM public.profiles
   WHERE user_id::text = v_survey.user_id::text
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id
      FROM public.profiles
     WHERE id::text = v_survey.user_id::text
     LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_missing');
  END IF;

  -- Idempotência
  IF COALESCE(v_survey.reward_given, false) THEN
    v_already := true;
    SELECT aura_xp INTO v_new_balance FROM public.profiles WHERE id = v_profile_id;
  ELSE
    -- xp_transactions.reference_id pode ser TEXT -> cast explícito
    PERFORM 1 FROM public.xp_transactions
      WHERE reference_id::text = v_survey.id::text
        AND action_type        = 'survey_reward'
      LIMIT 1;
    IF FOUND THEN
      v_already := true;
      UPDATE public.oculto_user_surveys
         SET reward_given = true,
             updated_at   = now()
       WHERE id = v_survey.id;
      SELECT aura_xp INTO v_new_balance FROM public.profiles WHERE id = v_profile_id;
    ELSE
      UPDATE public.profiles
         SET aura_xp    = COALESCE(aura_xp, 0) + v_xp_amount,
             updated_at = now()
       WHERE id = v_profile_id
      RETURNING aura_xp INTO v_new_balance;

      INSERT INTO public.xp_transactions (user_id, amount, action_type, description, reference_id)
      VALUES (
        v_profile_id,
        v_xp_amount,
        'survey_reward',
        'Recompensa por concluir a pesquisa OCULTO',
        v_survey.id::text  -- cast caso a coluna seja text
      );

      UPDATE public.oculto_user_surveys
         SET reward_given = true,
             updated_at   = now()
       WHERE id = v_survey.id;
    END IF;
  END IF;

  -- --------- Mensagem final do @oculto_master ---------------------------
  SELECT user_id::uuid INTO v_master_uid
    FROM public.profiles
   WHERE lower(username) = 'oculto_master'
   LIMIT 1;

  IF v_master_uid IS NULL THEN
    BEGIN
      SELECT u.id INTO v_master_uid
        FROM auth.users u
        JOIN public.oculto_welcome_message_settings s
          ON lower(u.email) = lower(s.sender_email)
       WHERE s.id = 1
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_master_uid := NULL;
    END;
  END IF;

  IF v_master_uid IS NOT NULL AND v_master_uid <> v_survey.user_id THEN
    SELECT cp1.conversation_id
      INTO v_conv_id
      FROM public.conversation_participants cp1
      JOIN public.conversation_participants cp2
        ON cp1.conversation_id = cp2.conversation_id
     WHERE cp1.user_id = v_master_uid
       AND cp2.user_id = v_survey.user_id
     LIMIT 1;

    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (created_at, updated_at)
      VALUES (now(), now())
      RETURNING id INTO v_conv_id;

      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (v_conv_id, v_master_uid), (v_conv_id, v_survey.user_id);
    END IF;

    SELECT id INTO v_msg_existing
      FROM public.messages
     WHERE conversation_id = v_conv_id
       AND sender_id       = v_master_uid
       AND content         = v_master_text
     LIMIT 1;

    IF v_msg_existing IS NULL THEN
      INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
      VALUES (v_conv_id, v_master_uid, v_master_text, true, false)
      RETURNING id INTO v_msg_id;
      v_msg_sent := true;
    ELSE
      v_msg_id := v_msg_existing;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'granted',         NOT v_already,
    'already',         v_already,
    'xp_amount',       v_xp_amount,
    'new_balance',     v_new_balance,
    'message_sent',    v_msg_sent,
    'message_id',      v_msg_id,
    'conversation_id', v_conv_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'oculto_survey_finalize_reward error: % / %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object(
    'ok',     false,
    'reason', 'exception',
    'error',  SQLERRM,
    'state',  SQLSTATE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oculto_survey_finalize_reward(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_survey_finalize_reward(uuid)
  TO authenticated, service_role;
