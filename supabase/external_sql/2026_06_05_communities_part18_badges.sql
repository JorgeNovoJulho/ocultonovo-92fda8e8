-- ============================================================================
-- Comunidades Ocultas — Parte 18 (idempotente)
-- Conquistas / badges por participação na comunidade
-- ============================================================================

-- 1) Definições de badge (globais quando community_id IS NULL)
CREATE TABLE IF NOT EXISTS public.oculto_community_badge_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Award',
  color text NOT NULL DEFAULT '#a855f7',
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_oc_badge_def_global
  ON public.oculto_community_badge_defs(code)
  WHERE community_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_oc_badge_def_scoped
  ON public.oculto_community_badge_defs(community_id, code)
  WHERE community_id IS NOT NULL;

GRANT SELECT ON public.oculto_community_badge_defs TO authenticated;
GRANT ALL ON public.oculto_community_badge_defs TO service_role;

ALTER TABLE public.oculto_community_badge_defs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read badge defs" ON public.oculto_community_badge_defs;
CREATE POLICY "read badge defs" ON public.oculto_community_badge_defs
FOR SELECT TO authenticated USING (is_active = true);

-- 2) Badges concedidos a usuário em uma comunidade
CREATE TABLE IF NOT EXISTS public.oculto_community_user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  badge_code text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(community_id, user_id, badge_code)
);

CREATE INDEX IF NOT EXISTS idx_oc_user_badges_user
  ON public.oculto_community_user_badges(user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_user_badges_community
  ON public.oculto_community_user_badges(community_id, granted_at DESC);

GRANT SELECT ON public.oculto_community_user_badges TO authenticated;
GRANT ALL ON public.oculto_community_user_badges TO service_role;

ALTER TABLE public.oculto_community_user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read user badges" ON public.oculto_community_user_badges;
CREATE POLICY "members read user badges" ON public.oculto_community_user_badges
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.oculto_community_members m
    WHERE m.community_id = oculto_community_user_badges.community_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);

-- 3) Seeds globais (idempotente)
INSERT INTO public.oculto_community_badge_defs (community_id, code, name, description, icon, color, criteria, position)
VALUES
  (NULL, 'first_topic',    'Primeiro tópico',     'Criou o primeiro tópico na comunidade.',     'Sparkles',       '#22d3ee', '{"topics":1}'::jsonb,                  10),
  (NULL, 'topics_10',      'Cronista',            'Criou 10 tópicos.',                          'PenLine',        '#a855f7', '{"topics":10}'::jsonb,                 20),
  (NULL, 'topics_50',      'Voz da comunidade',   'Criou 50 tópicos.',                          'Megaphone',      '#f59e0b', '{"topics":50}'::jsonb,                 30),
  (NULL, 'replies_25',     'Participativo',       'Fez 25 respostas.',                          'MessageCircle',  '#10b981', '{"replies":25}'::jsonb,                40),
  (NULL, 'replies_100',    'Conversador',         'Fez 100 respostas.',                         'MessagesSquare', '#10b981', '{"replies":100}'::jsonb,               50),
  (NULL, 'reactions_50',   'Querido',             'Recebeu 50 reações.',                        'Heart',          '#ef4444', '{"reactions_received":50}'::jsonb,     60),
  (NULL, 'reactions_200',  'Ídolo da tribo',      'Recebeu 200 reações.',                       'Flame',          '#ef4444', '{"reactions_received":200}'::jsonb,    70),
  (NULL, 'event_goer_3',   'Presente',            'Confirmou presença em 3 eventos.',           'CalendarCheck',  '#0ea5e9', '{"events_going":3}'::jsonb,            80),
  (NULL, 'member_30d',     'Veterano',            'Membro ativo há 30 dias.',                   'ShieldCheck',    '#84cc16', '{"member_days":30}'::jsonb,            90)
ON CONFLICT DO NOTHING;

-- corrige possíveis aspas inconsistentes nos seeds acima (ignora se já inseriu)
UPDATE public.oculto_community_badge_defs SET criteria = '{"replies":100}'::jsonb WHERE code='replies_100' AND criteria::text NOT LIKE '%100%';
UPDATE public.oculto_community_badge_defs SET criteria = '{"reactions_received":200}'::jsonb WHERE code='reactions_200' AND criteria::text NOT LIKE '%200%';
UPDATE public.oculto_community_badge_defs SET criteria = '{"events_going":3}'::jsonb WHERE code='event_goer_3' AND criteria::text NOT LIKE '%3%';
UPDATE public.oculto_community_badge_defs SET criteria = '{"member_days":30}'::jsonb WHERE code='member_30d' AND criteria::text NOT LIKE '%30%';

-- 4) Função de avaliação: calcula métricas e concede badges
CREATE OR REPLACE FUNCTION public.community_badge_evaluate(_community uuid, _user uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topics int := 0;
  v_replies int := 0;
  v_reactions_received int := 0;
  v_events_going int := 0;
  v_member_days int := 0;
  v_granted int := 0;
  r record;
  v_meets boolean;
BEGIN
  IF _community IS NULL OR _user IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_topics
    FROM public.oculto_community_topics
    WHERE community_id = _community AND author_id = _user AND status = 'active';

  SELECT count(*) INTO v_replies
    FROM public.oculto_community_replies r2
    JOIN public.oculto_community_topics t2 ON t2.id = r2.topic_id
    WHERE t2.community_id = _community AND r2.author_id = _user AND r2.status = 'active';

  -- reações recebidas em tópicos+replies do usuário nesta comunidade
  SELECT
    (SELECT count(*) FROM public.oculto_community_reactions rx
       JOIN public.oculto_community_topics t3 ON t3.id = rx.topic_id
       WHERE t3.community_id = _community AND t3.author_id = _user AND rx.user_id <> _user)
    +
    (SELECT count(*) FROM public.oculto_community_reactions rx
       JOIN public.oculto_community_replies r3 ON r3.id = rx.reply_id
       JOIN public.oculto_community_topics t4 ON t4.id = r3.topic_id
       WHERE t4.community_id = _community AND r3.author_id = _user AND rx.user_id <> _user)
  INTO v_reactions_received;

  -- eventos com RSVP "going" (tolerante se a tabela não existir)
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.oculto_community_event_rsvps e
              JOIN public.oculto_community_events ev ON ev.id = e.event_id
              WHERE ev.community_id = $1 AND e.user_id = $2 AND e.status = ''going'''
      INTO v_events_going USING _community, _user;
  EXCEPTION WHEN undefined_table THEN v_events_going := 0;
  END;

  SELECT GREATEST(0, EXTRACT(EPOCH FROM (now() - joined_at))/86400)::int INTO v_member_days
    FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = _user AND status = 'active'
    LIMIT 1;

  FOR r IN
    SELECT code, criteria
    FROM public.oculto_community_badge_defs
    WHERE is_active = true AND (community_id IS NULL OR community_id = _community)
  LOOP
    v_meets := true;
    IF (r.criteria ? 'topics')             AND v_topics            < (r.criteria->>'topics')::int            THEN v_meets := false; END IF;
    IF (r.criteria ? 'replies')            AND v_replies           < (r.criteria->>'replies')::int           THEN v_meets := false; END IF;
    IF (r.criteria ? 'reactions_received') AND v_reactions_received< (r.criteria->>'reactions_received')::int THEN v_meets := false; END IF;
    IF (r.criteria ? 'events_going')       AND v_events_going      < (r.criteria->>'events_going')::int      THEN v_meets := false; END IF;
    IF (r.criteria ? 'member_days')        AND v_member_days       < (r.criteria->>'member_days')::int       THEN v_meets := false; END IF;

    IF v_meets THEN
      INSERT INTO public.oculto_community_user_badges(community_id, user_id, badge_code, metadata)
      VALUES (_community, _user, r.code, jsonb_build_object(
        'topics', v_topics, 'replies', v_replies,
        'reactions_received', v_reactions_received,
        'events_going', v_events_going, 'member_days', v_member_days
      ))
      ON CONFLICT DO NOTHING;
      IF FOUND THEN
        v_granted := v_granted + 1;
        -- notifica
        INSERT INTO public.notifications(user_id, type, title, body, data)
        VALUES (_user, 'community_badge', 'Nova conquista!', 'Você desbloqueou: '||r.code,
                jsonb_build_object('community_id', _community, 'badge_code', r.code));
      END IF;
    END IF;
  END LOOP;

  RETURN v_granted;
END $$;

REVOKE ALL ON FUNCTION public.community_badge_evaluate(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_badge_evaluate(uuid, uuid) TO authenticated, service_role;

-- 5) Listagem: defs + badges do usuário
CREATE OR REPLACE FUNCTION public.community_badge_list(_community uuid, _user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(_user, auth.uid());
  v_defs jsonb;
  v_earned jsonb;
BEGIN
  IF _community IS NULL THEN RETURN '{"defs":[],"earned":[]}'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.position), '[]'::jsonb) INTO v_defs
  FROM public.oculto_community_badge_defs d
  WHERE d.is_active = true AND (d.community_id IS NULL OR d.community_id = _community);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'badge_code', b.badge_code,
    'granted_at', b.granted_at,
    'metadata', b.metadata
  ) ORDER BY b.granted_at DESC), '[]'::jsonb) INTO v_earned
  FROM public.oculto_community_user_badges b
  WHERE b.community_id = _community AND b.user_id = v_user;

  RETURN jsonb_build_object('defs', v_defs, 'earned', v_earned, 'user_id', v_user);
END $$;

REVOKE ALL ON FUNCTION public.community_badge_list(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_badge_list(uuid, uuid) TO authenticated, service_role;

-- 6) Triggers leves: ao criar tópico/reply/reação/RSVP → avalia
CREATE OR REPLACE FUNCTION public._ocb_eval_topic() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.community_badge_evaluate(NEW.community_id, NEW.author_id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ocb_eval_topic ON public.oculto_community_topics;
CREATE TRIGGER trg_ocb_eval_topic AFTER INSERT ON public.oculto_community_topics
FOR EACH ROW EXECUTE FUNCTION public._ocb_eval_topic();

CREATE OR REPLACE FUNCTION public._ocb_eval_reply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid;
BEGIN
  SELECT community_id INTO v_cid FROM public.oculto_community_topics WHERE id = NEW.topic_id;
  IF v_cid IS NOT NULL THEN
    PERFORM public.community_badge_evaluate(v_cid, NEW.author_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ocb_eval_reply ON public.oculto_community_replies;
CREATE TRIGGER trg_ocb_eval_reply AFTER INSERT ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public._ocb_eval_reply();

CREATE OR REPLACE FUNCTION public._ocb_eval_reaction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid; v_author uuid;
BEGIN
  IF NEW.topic_id IS NOT NULL THEN
    SELECT community_id, author_id INTO v_cid, v_author FROM public.oculto_community_topics WHERE id = NEW.topic_id;
  ELSIF NEW.reply_id IS NOT NULL THEN
    SELECT t.community_id, r.author_id INTO v_cid, v_author
    FROM public.oculto_community_replies r
    JOIN public.oculto_community_topics t ON t.id = r.topic_id
    WHERE r.id = NEW.reply_id;
  END IF;
  IF v_cid IS NOT NULL AND v_author IS NOT NULL AND v_author <> NEW.user_id THEN
    PERFORM public.community_badge_evaluate(v_cid, v_author);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ocb_eval_reaction ON public.oculto_community_reactions;
CREATE TRIGGER trg_ocb_eval_reaction AFTER INSERT ON public.oculto_community_reactions
FOR EACH ROW EXECUTE FUNCTION public._ocb_eval_reaction();

-- RSVP (defensivo: tabela pode existir ou não)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='oculto_community_event_rsvps') THEN
    CREATE OR REPLACE FUNCTION public._ocb_eval_rsvp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    DECLARE v_cid uuid;
    BEGIN
      SELECT community_id INTO v_cid FROM public.oculto_community_events WHERE id = NEW.event_id;
      IF v_cid IS NOT NULL THEN
        PERFORM public.community_badge_evaluate(v_cid, NEW.user_id);
      END IF;
      RETURN NEW;
    END $f$;
    DROP TRIGGER IF EXISTS trg_ocb_eval_rsvp ON public.oculto_community_event_rsvps;
    CREATE TRIGGER trg_ocb_eval_rsvp AFTER INSERT OR UPDATE ON public.oculto_community_event_rsvps
    FOR EACH ROW EXECUTE FUNCTION public._ocb_eval_rsvp();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
