-- ============================================================================
-- Survey Q&A -> Chat history
-- Após concluir a pesquisa, grava cada pergunta (como mensagem do @oculto_master)
-- e cada resposta (como mensagem do próprio usuário) na conversa entre os dois.
-- Idempotente via coluna oculto_user_surveys.qna_posted_at.
-- ============================================================================

-- 1) Flag de idempotência
ALTER TABLE public.oculto_user_surveys
  ADD COLUMN IF NOT EXISTS qna_posted_at timestamptz;

-- 2) Função
CREATE OR REPLACE FUNCTION public.oculto_survey_post_qna_to_chat(
  p_survey_id uuid,
  p_pairs     jsonb           -- [{question:text, answer:text, note?:text}, ...] ordenado
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey       public.oculto_user_surveys%ROWTYPE;
  v_caller       uuid := auth.uid();
  v_master_uid   uuid;
  v_conv_id      uuid;
  v_pair         jsonb;
  v_question     text;
  v_answer       text;
  v_note         text;
  v_inserted     int  := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_survey FROM public.oculto_user_surveys WHERE id = p_survey_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'survey_not_found');
  END IF;

  -- Só o dono da pesquisa pode disparar o histórico
  IF v_survey.user_id <> v_caller THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Idempotência: se já foi postado, retorna ok sem duplicar
  IF v_survey.qna_posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'inserted', 0);
  END IF;

  IF p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' OR jsonb_array_length(p_pairs) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pairs');
  END IF;

  -- Limite defensivo
  IF jsonb_array_length(p_pairs) > 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_many_pairs');
  END IF;

  -- Resolve master uid (mesma lógica do reward)
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

  IF v_master_uid IS NULL OR v_master_uid = v_caller THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'master_not_found');
  END IF;

  -- Localiza/cria conversa user <-> master
  SELECT cp1.conversation_id
    INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
   WHERE cp1.user_id = v_master_uid
     AND cp2.user_id = v_caller
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at)
    VALUES (now(), now())
    RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_master_uid), (v_conv_id, v_caller);
  END IF;

  -- Insere pares em ordem
  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
  LOOP
    v_question := NULLIF(BTRIM(COALESCE(v_pair->>'question','')), '');
    v_answer   := NULLIF(BTRIM(COALESCE(v_pair->>'answer','')), '');
    v_note     := NULLIF(BTRIM(COALESCE(v_pair->>'note','')), '');

    IF v_question IS NULL OR v_answer IS NULL THEN
      CONTINUE;
    END IF;

    -- Pergunta (master)
    INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
    VALUES (v_conv_id, v_master_uid, v_question, true, false);

    -- Resposta (usuário)
    INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
    VALUES (
      v_conv_id,
      v_caller,
      CASE WHEN v_note IS NOT NULL THEN v_answer || E'\n\n' || v_note ELSE v_answer END,
      false,
      true
    );

    v_inserted := v_inserted + 2;
  END LOOP;

  UPDATE public.oculto_user_surveys
     SET qna_posted_at = now(),
         updated_at    = now()
   WHERE id = p_survey_id;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'conversation_id', v_conv_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'oculto_survey_post_qna_to_chat error: % / %', SQLERRM, SQLSTATE;
  RETURN jsonb_build_object('ok', false, 'reason', 'exception', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.oculto_survey_post_qna_to_chat(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_survey_post_qna_to_chat(uuid, jsonb)
  TO authenticated, service_role;
