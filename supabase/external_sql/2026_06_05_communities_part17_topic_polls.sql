-- ╔════════════════════════════════════════════════════════════════╗
-- ║  Comunidades Ocultas — Parte 17 — Enquetes nos tópicos         ║
-- ║  Banco: rvybbrkzmboqbhcemqar (EXTERNO)                         ║
-- ║  Idempotente.                                                  ║
-- ╚════════════════════════════════════════════════════════════════╝

-- 1) Tabelas
CREATE TABLE IF NOT EXISTS public.oculto_community_topic_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  allow_multiple boolean NOT NULL DEFAULT false,
  closes_at timestamptz,
  is_closed boolean NOT NULL DEFAULT false,
  total_votes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_topic_polls TO authenticated;
GRANT ALL ON public.oculto_community_topic_polls TO service_role;
ALTER TABLE public.oculto_community_topic_polls ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_octp_topic ON public.oculto_community_topic_polls(topic_id);
CREATE INDEX IF NOT EXISTS idx_octp_community ON public.oculto_community_topic_polls(community_id);

CREATE TABLE IF NOT EXISTS public.oculto_community_topic_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.oculto_community_topic_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position int NOT NULL DEFAULT 0,
  votes_count int NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_topic_poll_options TO authenticated;
GRANT ALL ON public.oculto_community_topic_poll_options TO service_role;
ALTER TABLE public.oculto_community_topic_poll_options ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_octpo_poll ON public.oculto_community_topic_poll_options(poll_id, position);

CREATE TABLE IF NOT EXISTS public.oculto_community_topic_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.oculto_community_topic_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.oculto_community_topic_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(poll_id, option_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_topic_poll_votes TO authenticated;
GRANT ALL ON public.oculto_community_topic_poll_votes TO service_role;
ALTER TABLE public.oculto_community_topic_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_octpv_poll ON public.oculto_community_topic_poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_octpv_user ON public.oculto_community_topic_poll_votes(user_id);

-- 2) RLS — leitura por membros (ou comunidade pública); insert/update via RPC
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_community_topic_polls' AND policyname='octp_select_member') THEN
    CREATE POLICY octp_select_member ON public.oculto_community_topic_polls
    FOR SELECT TO authenticated USING (
      public.oculto_is_master(auth.uid())
      OR EXISTS (SELECT 1 FROM public.oculto_community_members m
                 WHERE m.community_id = oculto_community_topic_polls.community_id
                   AND m.user_id = auth.uid() AND m.status='active')
      OR EXISTS (SELECT 1 FROM public.oculto_communities c
                 WHERE c.id = oculto_community_topic_polls.community_id AND c.visibility='public')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_community_topic_poll_options' AND policyname='octpo_select_member') THEN
    CREATE POLICY octpo_select_member ON public.oculto_community_topic_poll_options
    FOR SELECT TO authenticated USING (
      public.oculto_is_master(auth.uid())
      OR EXISTS (SELECT 1 FROM public.oculto_community_topic_polls p
                 JOIN public.oculto_community_members m ON m.community_id = p.community_id
                 WHERE p.id = oculto_community_topic_poll_options.poll_id
                   AND m.user_id = auth.uid() AND m.status='active')
      OR EXISTS (SELECT 1 FROM public.oculto_community_topic_polls p
                 JOIN public.oculto_communities c ON c.id = p.community_id
                 WHERE p.id = oculto_community_topic_poll_options.poll_id AND c.visibility='public')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_community_topic_poll_votes' AND policyname='octpv_select_member') THEN
    CREATE POLICY octpv_select_member ON public.oculto_community_topic_poll_votes
    FOR SELECT TO authenticated USING (
      public.oculto_is_master(auth.uid())
      OR user_id = auth.uid()
    );
  END IF;
END $$;

-- 3) Recálculo de contadores
CREATE OR REPLACE FUNCTION public._octp_recount(_poll uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.oculto_community_topic_poll_options o
  SET votes_count = COALESCE((SELECT count(*) FROM public.oculto_community_topic_poll_votes v WHERE v.option_id = o.id), 0)
  WHERE o.poll_id = _poll;
  UPDATE public.oculto_community_topic_polls p
  SET total_votes = COALESCE((SELECT count(*) FROM public.oculto_community_topic_poll_votes v WHERE v.poll_id = _poll), 0)
  WHERE p.id = _poll;
$$;

CREATE OR REPLACE FUNCTION public._octp_votes_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._octp_recount(COALESCE(NEW.poll_id, OLD.poll_id)); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS trg_octp_votes_after ON public.oculto_community_topic_poll_votes;
CREATE TRIGGER trg_octp_votes_after AFTER INSERT OR DELETE ON public.oculto_community_topic_poll_votes
FOR EACH ROW EXECUTE FUNCTION public._octp_votes_after();

-- 4) RPC: criar enquete (autor do tópico ou mod)
CREATE OR REPLACE FUNCTION public.community_topic_poll_create(
  _topic uuid,
  _question text,
  _options text[],
  _allow_multiple boolean DEFAULT false,
  _closes_at timestamptz DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_author uuid;
  v_id uuid;
  i int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT community_id, author_id INTO v_comm, v_author FROM public.oculto_community_topics WHERE id = _topic;
  IF v_comm IS NULL THEN RAISE EXCEPTION 'topic_not_found'; END IF;
  IF v_author <> v_uid AND NOT public._community_can_moderate(v_uid, v_comm) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _question IS NULL OR length(btrim(_question)) < 3 THEN RAISE EXCEPTION 'question_required'; END IF;
  IF _options IS NULL OR array_length(_options,1) < 2 THEN RAISE EXCEPTION 'min_two_options'; END IF;
  IF array_length(_options,1) > 8 THEN RAISE EXCEPTION 'max_eight_options'; END IF;

  INSERT INTO public.oculto_community_topic_polls(topic_id, community_id, created_by, question, allow_multiple, closes_at)
  VALUES (_topic, v_comm, v_uid, btrim(_question), COALESCE(_allow_multiple,false), _closes_at)
  RETURNING id INTO v_id;

  FOR i IN 1..array_length(_options,1) LOOP
    IF length(btrim(_options[i])) > 0 THEN
      INSERT INTO public.oculto_community_topic_poll_options(poll_id, label, position)
      VALUES (v_id, btrim(_options[i]), i);
    END IF;
  END LOOP;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.community_topic_poll_create(uuid, text, text[], boolean, timestamptz) TO authenticated;

-- 5) RPC: votar (toggle). Em enquete single-choice, troca o voto anterior.
CREATE OR REPLACE FUNCTION public.community_topic_poll_vote(_poll uuid, _option uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_closed boolean;
  v_allow_multi boolean;
  v_closes_at timestamptz;
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT community_id, is_closed, allow_multiple, closes_at
    INTO v_comm, v_closed, v_allow_multi, v_closes_at
  FROM public.oculto_community_topic_polls WHERE id = _poll;

  IF v_comm IS NULL THEN RAISE EXCEPTION 'poll_not_found'; END IF;
  IF v_closed OR (v_closes_at IS NOT NULL AND v_closes_at < now()) THEN
    RAISE EXCEPTION 'poll_closed';
  END IF;

  IF NOT public.oculto_is_master(v_uid) AND NOT EXISTS (
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = v_comm AND user_id = v_uid AND status='active'
  ) THEN RAISE EXCEPTION 'not_member'; END IF;

  -- Garantir que a opção pertence à enquete
  IF NOT EXISTS (SELECT 1 FROM public.oculto_community_topic_poll_options WHERE id = _option AND poll_id = _poll) THEN
    RAISE EXCEPTION 'option_invalid';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.oculto_community_topic_poll_votes
    WHERE poll_id = _poll AND option_id = _option AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    -- toggle off
    DELETE FROM public.oculto_community_topic_poll_votes
    WHERE poll_id = _poll AND option_id = _option AND user_id = v_uid;
  ELSE
    IF NOT v_allow_multi THEN
      DELETE FROM public.oculto_community_topic_poll_votes
      WHERE poll_id = _poll AND user_id = v_uid;
    END IF;
    INSERT INTO public.oculto_community_topic_poll_votes(poll_id, option_id, user_id)
    VALUES (_poll, _option, v_uid);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.community_topic_poll_vote(uuid, uuid) TO authenticated;

-- 6) RPC: fechar / reabrir enquete
CREATE OR REPLACE FUNCTION public.community_topic_poll_close(_poll uuid, _close boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT community_id, created_by INTO v_comm, v_creator FROM public.oculto_community_topic_polls WHERE id = _poll;
  IF v_comm IS NULL THEN RAISE EXCEPTION 'poll_not_found'; END IF;
  IF v_creator <> v_uid AND NOT public._community_can_moderate(v_uid, v_comm) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.oculto_community_topic_polls SET is_closed = COALESCE(_close,true) WHERE id = _poll;
END $$;
GRANT EXECUTE ON FUNCTION public.community_topic_poll_close(uuid, boolean) TO authenticated;

-- 7) RPC: deletar enquete
CREATE OR REPLACE FUNCTION public.community_topic_poll_delete(_poll uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_comm uuid;
  v_creator uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT community_id, created_by INTO v_comm, v_creator FROM public.oculto_community_topic_polls WHERE id = _poll;
  IF v_comm IS NULL THEN RETURN; END IF;
  IF v_creator <> v_uid AND NOT public._community_can_moderate(v_uid, v_comm) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.oculto_community_topic_polls WHERE id = _poll;
END $$;
GRANT EXECUTE ON FUNCTION public.community_topic_poll_delete(uuid) TO authenticated;

-- 8) RPC: ler enquete do tópico (com opções e meu voto)
CREATE OR REPLACE FUNCTION public.community_topic_poll_get(_topic uuid)
RETURNS TABLE(
  poll_id uuid,
  question text,
  allow_multiple boolean,
  is_closed boolean,
  closes_at timestamptz,
  total_votes int,
  created_by uuid,
  options jsonb,
  my_option_ids uuid[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT * FROM public.oculto_community_topic_polls WHERE topic_id = _topic LIMIT 1
  )
  SELECT
    p.id AS poll_id,
    p.question,
    p.allow_multiple,
    p.is_closed,
    p.closes_at,
    p.total_votes,
    p.created_by,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'votes', o.votes_count, 'position', o.position) ORDER BY o.position)
      FROM public.oculto_community_topic_poll_options o WHERE o.poll_id = p.id
    ), '[]'::jsonb) AS options,
    COALESCE((
      SELECT array_agg(v.option_id)
      FROM public.oculto_community_topic_poll_votes v
      WHERE v.poll_id = p.id AND v.user_id = auth.uid()
    ), ARRAY[]::uuid[]) AS my_option_ids
  FROM p;
$$;
GRANT EXECUTE ON FUNCTION public.community_topic_poll_get(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
