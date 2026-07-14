-- =========================================================================
-- 2026-06-20 — DIAGNÓSTICO + FIX: pesquisa do @andarilha
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =========================================================================

-- 1) Ver a pesquisa do andarilha + steps respondidos
SELECT s.id, s.status, s.reward_given,
       s.source_channel, s.first_impression, s.main_interest,
       s.main_friction, s.return_reason,
       s.started_at, s.completed_at, s.updated_at
FROM public.oculto_user_surveys s
JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
WHERE lower(p.username) = 'andarilha';

SELECT st.survey_id, st.step_number, st.question_key,
       st.answer_value, st.answer_note, st.created_at
FROM public.oculto_user_survey_steps st
JOIN public.oculto_user_surveys s ON s.id = st.survey_id
JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
WHERE lower(p.username) = 'andarilha'
ORDER BY st.step_number;

-- 2) FIX: se ele respondeu as 4 perguntas principais, força status=completed
--    e entrega o presente (+200 XP) idempotente via RPC já existente.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.id
    FROM public.oculto_user_surveys s
    JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
    WHERE lower(p.username) = 'andarilha'
      AND s.source_channel IS NOT NULL
      AND s.first_impression IS NOT NULL
      AND s.main_interest IS NOT NULL
      AND s.main_friction IS NOT NULL
      AND s.status <> 'completed'
  LOOP
    UPDATE public.oculto_user_surveys
       SET status = 'completed',
           completed_at = COALESCE(completed_at, now()),
           updated_at = now()
     WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT s.id
    FROM public.oculto_user_surveys s
    JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
    WHERE lower(p.username) = 'andarilha'
      AND s.status = 'completed'
      AND s.reward_given IS NOT TRUE
  LOOP
    PERFORM public.oculto_survey_finalize_reward(r.id);
  END LOOP;
END $$;

-- 3) Reaplica grants (não custa nada)
GRANT EXECUTE ON FUNCTION public.oculto_survey_finalize_reward(uuid)
  TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
