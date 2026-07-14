-- ============================================================
-- Fix 1: Tópicos não aparecem para não-membros em comunidades públicas.
--   Causa: a política occ_topics_read tinha `status = 'published'`
--   sem qualificação, e dentro do EXISTS o nome "status" resolvia
--   para `oculto_communities.status` (sempre 'active'), nunca 'published'.
--   Solução: qualificar como `oculto_community_topics.status`.
--
-- Fix 2: "Falha ao entrar" em community_join_with_answers.
--   Causa: public.community_join retorna TEXT, mas a função capturava em
--   variável JSONB (cast text→jsonb falha). Solução: capturar em TEXT e
--   devolver jsonb_build_object('status', v_status).
-- Idempotente · External Supabase only
-- ============================================================

DROP POLICY IF EXISTS occ_topics_read ON public.oculto_community_topics;
CREATE POLICY occ_topics_read ON public.oculto_community_topics FOR SELECT USING (
  public.oculto_is_master()
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.oculto_communities c
    WHERE c.id = public.oculto_community_topics.community_id
      AND (
        (
          c.visibility = 'public'
          AND c.status = 'active'
          AND public.oculto_community_topics.status = 'published'
        )
        OR public.oculto_is_community_member(c.id, auth.uid())
        OR c.owner_id = auth.uid()
      )
  )
);

CREATE OR REPLACE FUNCTION public.community_join_with_answers(
  _community uuid,
  _answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req_total int;
  v_provided int := 0;
  v_a jsonb;
  v_qid uuid;
  v_ans text;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT COUNT(*) INTO v_req_total
    FROM public.oculto_community_join_questions
   WHERE community_id = _community AND is_active = true AND is_required = true;

  DELETE FROM public.oculto_community_join_answers
   WHERE community_id = _community AND user_id = auth.uid();

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(_answers,'[]'::jsonb))
  LOOP
    v_qid := NULLIF(v_a->>'question_id','')::uuid;
    v_ans := NULLIF(trim(v_a->>'answer'),'');
    IF v_qid IS NULL OR v_ans IS NULL THEN CONTINUE; END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.oculto_community_join_questions
       WHERE id = v_qid AND community_id = _community AND is_active = true
    ) THEN CONTINUE; END IF;

    INSERT INTO public.oculto_community_join_answers(community_id, user_id, question_id, answer)
    VALUES (_community, auth.uid(), v_qid, v_ans);

    v_provided := v_provided + 1;
  END LOOP;

  IF v_req_total > 0 AND v_provided < v_req_total THEN
    RAISE EXCEPTION 'missing_required_answers';
  END IF;

  v_status := public.community_join(_community);
  RETURN jsonb_build_object('status', v_status);
END $$;
GRANT EXECUTE ON FUNCTION public.community_join_with_answers(uuid, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
