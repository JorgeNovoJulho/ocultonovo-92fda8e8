-- =========================================================================
-- 2026-06-20 — FIX: métricas administrativas da pesquisa via RPC segura
-- Rodar no SQL Editor do Supabase EXTERNO.
--
-- Problema corrigido:
--   O painel /admin/pesquisas estava lendo as tabelas diretamente pelo SDK.
--   Quando o master era reconhecido no frontend por e-mail, mas não pela RLS,
--   a consulta retornava apenas a pesquisa do próprio master e escondia as
--   respostas reais dos usuários. Esta RPC usa SECURITY DEFINER, valida o
--   master por e-mail/role e retorna surveys + steps canônicos para o painel.
-- =========================================================================

-- 1) Helper compatível com políticas antigas que chamam is_admin_master().
--    Mantém user_roles como fonte de role e adiciona a exceção do master canônico.
CREATE OR REPLACE FUNCTION public.is_admin_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'ocultomaster@ocultoswing.com.br'
    OR EXISTS (
      SELECT 1
        FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role::text = 'admin_master'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_master() TO authenticated, service_role;

-- 2) RPC administrativa: retorna a fonte completa do painel em um único payload.
CREATE OR REPLACE FUNCTION public.oculto_admin_survey_results()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
  v_surveys jsonb;
  v_steps jsonb;
BEGIN
  v_is_master := COALESCE(public.is_admin_master(), false);

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'Acesso negado: apenas master admin pode ver métricas da pesquisa'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC), '[]'::jsonb)
    INTO v_surveys
    FROM (
      SELECT id,
             status,
             reward_given,
             source_channel,
             first_impression,
             main_interest,
             main_friction,
             return_reason,
             source_channel_other,
             first_impression_note,
             main_interest_note,
             main_friction_note,
             return_reason_note,
             created_at,
             completed_at,
             updated_at
        FROM public.oculto_user_surveys
       ORDER BY created_at DESC
       LIMIT 5000
    ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(st) ORDER BY st.created_at ASC), '[]'::jsonb)
    INTO v_steps
    FROM (
      SELECT survey_id,
             question_key,
             answer_value,
             answer_note,
             created_at
        FROM public.oculto_user_survey_steps
       WHERE question_key IN (
         'source_channel',
         'first_impression',
         'main_interest',
         'main_friction',
         'return_reason'
       )
       ORDER BY created_at ASC
       LIMIT 25000
    ) st;

  RETURN jsonb_build_object(
    'surveys', v_surveys,
    'steps', v_steps
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_admin_survey_results() TO authenticated, service_role;

-- 3) Mantém permissões de tabela existentes e recarrega cache da API.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_surveys TO authenticated;
GRANT ALL ON public.oculto_user_surveys TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_survey_steps TO authenticated;
GRANT ALL ON public.oculto_user_survey_steps TO service_role;

NOTIFY pgrst, 'reload schema';

-- 4) Verificação segura no SQL Editor.
--    IMPORTANTE: não chame public.oculto_admin_survey_results() aqui, porque
--    o SQL Editor não executa com o JWT do usuário logado no app; a RPC deve
--    ser testada pelo painel /admin/pesquisas, onde o JWT do master existe.
SELECT 'rpc_instalada' AS status,
       COUNT(*) AS pesquisas_total,
       COUNT(*) FILTER (WHERE status = 'completed') AS pesquisas_concluidas,
       COUNT(*) FILTER (WHERE reward_given IS TRUE) AS xp_entregue
  FROM public.oculto_user_surveys;

SELECT question_key,
       COUNT(*) AS respostas
  FROM public.oculto_user_survey_steps
 WHERE question_key IN (
   'source_channel',
   'first_impression',
   'main_interest',
   'main_friction',
   'return_reason'
 )
 GROUP BY question_key
 ORDER BY question_key;