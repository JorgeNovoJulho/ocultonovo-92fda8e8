-- =========================================================================
-- 2026-06-20 — FIX: sincronizar respostas reais da pesquisa nas métricas
-- Rodar no SQL Editor do Supabase EXTERNO.
--
-- O problema: algumas respostas ficaram salvas em oculto_user_survey_steps,
-- mas as colunas espelho de oculto_user_surveys/status não refletiram isso.
-- Este script é idempotente: pode rodar mais de uma vez sem duplicar XP.
-- =========================================================================

BEGIN;

-- 1) Copia a resposta canônica por etapa para as colunas espelho usadas no painel.
WITH latest_steps AS (
  SELECT DISTINCT ON (survey_id, question_key)
         survey_id,
         question_key,
         NULLIF(BTRIM(answer_value), '') AS answer_value,
         NULLIF(BTRIM(answer_note), '') AS answer_note,
         created_at
    FROM public.oculto_user_survey_steps
   WHERE question_key IN (
     'source_channel',
     'first_impression',
     'main_interest',
     'main_friction',
     'return_reason'
   )
   ORDER BY survey_id, question_key, created_at DESC
), pivoted AS (
  SELECT survey_id,
         MAX(answer_value) FILTER (WHERE question_key = 'source_channel')    AS source_channel,
         MAX(answer_note)  FILTER (WHERE question_key = 'source_channel')    AS source_channel_other,
         MAX(answer_value) FILTER (WHERE question_key = 'first_impression')  AS first_impression,
         MAX(answer_note)  FILTER (WHERE question_key = 'first_impression')  AS first_impression_note,
         MAX(answer_value) FILTER (WHERE question_key = 'main_interest')     AS main_interest,
         MAX(answer_note)  FILTER (WHERE question_key = 'main_interest')     AS main_interest_note,
         MAX(answer_value) FILTER (WHERE question_key = 'main_friction')     AS main_friction,
         MAX(answer_note)  FILTER (WHERE question_key = 'main_friction')     AS main_friction_note,
         MAX(answer_value) FILTER (WHERE question_key = 'return_reason')     AS return_reason,
         MAX(answer_note)  FILTER (WHERE question_key = 'return_reason')     AS return_reason_note
    FROM latest_steps
   GROUP BY survey_id
)
UPDATE public.oculto_user_surveys s
   SET source_channel        = COALESCE(NULLIF(BTRIM(s.source_channel), ''), p.source_channel),
       source_channel_other  = COALESCE(NULLIF(BTRIM(s.source_channel_other), ''), p.source_channel_other),
       first_impression      = COALESCE(NULLIF(BTRIM(s.first_impression), ''), p.first_impression),
       first_impression_note = COALESCE(NULLIF(BTRIM(s.first_impression_note), ''), p.first_impression_note),
       main_interest         = COALESCE(NULLIF(BTRIM(s.main_interest), ''), p.main_interest),
       main_interest_note    = COALESCE(NULLIF(BTRIM(s.main_interest_note), ''), p.main_interest_note),
       main_friction         = COALESCE(NULLIF(BTRIM(s.main_friction), ''), p.main_friction),
       main_friction_note    = COALESCE(NULLIF(BTRIM(s.main_friction_note), ''), p.main_friction_note),
       return_reason         = COALESCE(NULLIF(BTRIM(s.return_reason), ''), p.return_reason),
       return_reason_note    = COALESCE(NULLIF(BTRIM(s.return_reason_note), ''), p.return_reason_note),
       updated_at            = now()
  FROM pivoted p
 WHERE s.id = p.survey_id;

-- 2) Marca como concluídas as pesquisas com todas as 5 respostas atuais.
UPDATE public.oculto_user_surveys
   SET status = 'completed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE status NOT IN ('completed', 'skipped')
   AND NULLIF(BTRIM(source_channel), '') IS NOT NULL
   AND NULLIF(BTRIM(first_impression), '') IS NOT NULL
   AND NULLIF(BTRIM(main_interest), '') IS NOT NULL
   AND NULLIF(BTRIM(main_friction), '') IS NOT NULL
   AND NULLIF(BTRIM(return_reason), '') IS NOT NULL;

-- 3) Corrige pesquisas antigas finalizadas no fluxo de 4 perguntas,
-- antes da quinta pergunta aparecer corretamente para os usuários.
UPDATE public.oculto_user_surveys
   SET status = 'completed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE status NOT IN ('completed', 'skipped')
   AND created_at < TIMESTAMPTZ '2026-06-20 12:40:00+00'
   AND NULLIF(BTRIM(source_channel), '') IS NOT NULL
   AND NULLIF(BTRIM(first_impression), '') IS NOT NULL
   AND NULLIF(BTRIM(main_interest), '') IS NOT NULL
   AND NULLIF(BTRIM(main_friction), '') IS NOT NULL;

COMMIT;

-- 4) Entrega o presente de +200 XP pendente para concluídas sem recompensa.
-- A função oculto_survey_finalize_reward é idempotente e não duplica XP.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
      FROM public.oculto_user_surveys
     WHERE status = 'completed'
       AND reward_given IS NOT TRUE
  LOOP
    PERFORM public.oculto_survey_finalize_reward(r.id);
  END LOOP;
END $$;

-- 5) Verificação geral das métricas após o reparo.
SELECT status,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE reward_given IS TRUE) AS xp_entregue,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(source_channel), '') IS NOT NULL) AS q1,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(first_impression), '') IS NOT NULL) AS q2,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(main_interest), '') IS NOT NULL) AS q3,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(main_friction), '') IS NOT NULL) AS q4,
       COUNT(*) FILTER (WHERE NULLIF(BTRIM(return_reason), '') IS NOT NULL) AS q5
  FROM public.oculto_user_surveys
 GROUP BY status
 ORDER BY status;

-- 6) Verificação específica do @andarilha.
SELECT p.username,
       s.status,
       s.reward_given,
       s.source_channel,
       s.first_impression,
       s.main_interest,
       s.main_friction,
       s.return_reason,
       s.completed_at,
       p.aura_xp
  FROM public.oculto_user_surveys s
  JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id
 WHERE lower(p.username) = 'andarilha'
 ORDER BY s.created_at DESC;