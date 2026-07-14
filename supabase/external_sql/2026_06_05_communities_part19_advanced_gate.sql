-- ============================================================
-- Comunidades Ocultas — PARTE 19
-- Convites direcionados + Perguntas de portaria
-- Idempotente. Executar no Supabase EXTERNO (SQL Editor).
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) CONVITE DIRECIONADO A USUÁRIO ESPECÍFICO
-- ─────────────────────────────────────────────

ALTER TABLE public.oculto_community_invites
  ADD COLUMN IF NOT EXISTS target_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_oculto_community_invites_target
  ON public.oculto_community_invites(target_user_id)
  WHERE target_user_id IS NOT NULL;

-- RPC: criar convite direcionado a 1 usuário (notifica automaticamente)
CREATE OR REPLACE FUNCTION public.community_invite_user(
  _community uuid,
  _target    uuid,
  _expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
  v_code text;
  v_id uuid;
  v_title text;
  v_actor_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _target = auth.uid() THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;

  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community
       AND user_id = auth.uid()
       AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Não convidar quem já é membro ativo
  IF EXISTS (
    SELECT 1 FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = _target AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  v_code := encode(gen_random_bytes(9), 'base64');
  v_code := regexp_replace(v_code, '[^a-zA-Z0-9]', '', 'g');
  v_code := substring(v_code, 1, 10);

  INSERT INTO public.oculto_community_invites(community_id, code, created_by, expires_at, max_uses, target_user_id)
  VALUES (_community, v_code, auth.uid(), COALESCE(_expires_at, NOW() + INTERVAL '14 days'), 1, _target)
  RETURNING id INTO v_id;

  SELECT title INTO v_title FROM public.oculto_communities WHERE id = _community;
  SELECT COALESCE(display_name, name, username, 'Alguém')
    INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  -- Notifica o convidado
  INSERT INTO public.notifications(user_id, type, title, message, data)
  VALUES (
    _target,
    'community_invite',
    'Convite para uma comunidade',
    v_actor_name || ' te convidou para "' || COALESCE(v_title,'a comunidade') || '"',
    jsonb_build_object(
      'community_id', _community,
      'invite_code',  v_code,
      'invite_id',    v_id,
      'actor_id',     auth.uid()
    )
  );

  RETURN jsonb_build_object('id', v_id, 'code', v_code);
END $$;

GRANT EXECUTE ON FUNCTION public.community_invite_user(uuid, uuid, timestamptz) TO authenticated;

-- ─────────────────────────────────────────────
-- 2) PERGUNTAS DE PORTARIA (gating questions)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.oculto_community_join_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  question text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_occ_jq_community
  ON public.oculto_community_join_questions(community_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_join_questions TO authenticated;
GRANT ALL ON public.oculto_community_join_questions TO service_role;
ALTER TABLE public.oculto_community_join_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "occ_jq_select_all" ON public.oculto_community_join_questions;
CREATE POLICY "occ_jq_select_all" ON public.oculto_community_join_questions
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "occ_jq_no_direct_write" ON public.oculto_community_join_questions;
CREATE POLICY "occ_jq_no_direct_write" ON public.oculto_community_join_questions
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Respostas dos candidatos
CREATE TABLE IF NOT EXISTS public.oculto_community_join_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.oculto_community_join_questions(id) ON DELETE CASCADE,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_occ_ja_community_user
  ON public.oculto_community_join_answers(community_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_join_answers TO authenticated;
GRANT ALL ON public.oculto_community_join_answers TO service_role;
ALTER TABLE public.oculto_community_join_answers ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê suas respostas; mods leem via RPC (security definer)
DROP POLICY IF EXISTS "occ_ja_select_own" ON public.oculto_community_join_answers;
CREATE POLICY "occ_ja_select_own" ON public.oculto_community_join_answers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "occ_ja_no_direct_write" ON public.oculto_community_join_answers;
CREATE POLICY "occ_ja_no_direct_write" ON public.oculto_community_join_answers
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────
-- 3) RPCs — configuração das perguntas (dono/mod)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_join_questions_list(_community uuid)
RETURNS SETOF public.oculto_community_join_questions
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.oculto_community_join_questions
   WHERE community_id = _community AND is_active = true
   ORDER BY position ASC, created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.community_join_questions_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.community_join_questions_set(
  _community uuid,
  _questions jsonb  -- [{question:text, is_required:bool, position:int}]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
  v_q jsonb;
  v_pos int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = auth.uid() AND status='active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Soft delete (desativa as atuais)
  UPDATE public.oculto_community_join_questions
     SET is_active = false
   WHERE community_id = _community AND is_active = true;

  -- Recria
  FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(_questions,'[]'::jsonb))
  LOOP
    v_pos := v_pos + 1;
    INSERT INTO public.oculto_community_join_questions(community_id, question, is_required, position)
    VALUES (
      _community,
      NULLIF(trim(v_q->>'question'),''),
      COALESCE((v_q->>'is_required')::boolean, true),
      COALESCE((v_q->>'position')::int, v_pos)
    );
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.community_join_questions_set(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────
-- 4) RPC — entrar com respostas
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_join_with_answers(
  _community uuid,
  _answers jsonb  -- [{question_id:uuid, answer:text}]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req_total int;
  v_provided int := 0;
  v_a jsonb;
  v_qid uuid;
  v_ans text;
  v_join jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Conta perguntas obrigatórias ativas
  SELECT COUNT(*) INTO v_req_total
    FROM public.oculto_community_join_questions
   WHERE community_id = _community AND is_active = true AND is_required = true;

  -- Persiste respostas (apaga anteriores do usuário nesta comunidade)
  DELETE FROM public.oculto_community_join_answers
   WHERE community_id = _community AND user_id = auth.uid();

  FOR v_a IN SELECT * FROM jsonb_array_elements(COALESCE(_answers,'[]'::jsonb))
  LOOP
    v_qid := NULLIF(v_a->>'question_id','')::uuid;
    v_ans := NULLIF(trim(v_a->>'answer'),'');
    IF v_qid IS NULL OR v_ans IS NULL THEN CONTINUE; END IF;

    -- só aceita perguntas reais ativas desta comunidade
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

  -- Delega entrada ao fluxo padrão
  SELECT public.community_join(_community) INTO v_join;
  RETURN v_join;
END $$;
GRANT EXECUTE ON FUNCTION public.community_join_with_answers(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────
-- 5) RPC — ver respostas de um candidato (mods)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_member_answers(_community uuid, _user uuid)
RETURNS TABLE (
  question_id uuid,
  question text,
  answer text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = auth.uid() AND status='active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
    SELECT a.question_id, q.question, a.answer, a.created_at
      FROM public.oculto_community_join_answers a
      JOIN public.oculto_community_join_questions q ON q.id = a.question_id
     WHERE a.community_id = _community AND a.user_id = _user
     ORDER BY q.position ASC, a.created_at ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.community_member_answers(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- FIM PARTE 19
