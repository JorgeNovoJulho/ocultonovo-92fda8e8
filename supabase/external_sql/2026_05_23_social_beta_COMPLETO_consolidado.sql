Aqui está o SQL completo consolidado das **3 fatias** (3.1 — módulos/cartas/eventos, 3.2 — admin RPCs, 3.4 — denúncias) pronto para copiar e colar no SQL Editor do Supabase externo:

```sql
-- =====================================================================
-- MÓDULO SOCIAL BETA — SQL COMPLETO CONSOLIDADO
-- Fatias: 3.1 (módulos/cartas/eventos) + 3.2 (admin RPCs) + 3.4 (denúncias)
-- Idempotente. Execute no SQL Editor do Supabase EXTERNO.
-- Dependência: public.social_beta_is_master() e public.oculto_touch_updated_at()
--                já devem existir no banco.
-- =====================================================================

-- ============================================================
-- PARTE 1 — TABELAS (Fatia 3.1)
-- ============================================================

-- 1) Catálogo de MÓDULOS
CREATE TABLE IF NOT EXISTS public.oculto_social_beta_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  default_label TEXT NOT NULL,
  description TEXT,
  max_level TEXT NOT NULL DEFAULT 'provocante'
    CHECK (max_level IN ('leve','divertido','provocante','avancado')),
  cooldown_seconds INT NOT NULL DEFAULT 0,
  allowed_context TEXT NOT NULL DEFAULT 'ambos'
    CHECK (allowed_context IN ('duo','grupo','ambos')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_social_beta_modules_enabled
  ON public.oculto_social_beta_modules(enabled, sort_order);

DROP TRIGGER IF EXISTS trg_oculto_social_beta_modules_updated_at
  ON public.oculto_social_beta_modules;
CREATE TRIGGER trg_oculto_social_beta_modules_updated_at
  BEFORE UPDATE ON public.oculto_social_beta_modules
  FOR EACH ROW EXECUTE FUNCTION public.oculto_touch_updated_at();

ALTER TABLE public.oculto_social_beta_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS modules_read ON public.oculto_social_beta_modules;
CREATE POLICY modules_read ON public.oculto_social_beta_modules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS modules_write_master ON public.oculto_social_beta_modules;
CREATE POLICY modules_write_master ON public.oculto_social_beta_modules
  FOR ALL TO authenticated
  USING (public.social_beta_is_master())
  WITH CHECK (public.social_beta_is_master());

-- 2) CARTAS (prompts/perguntas dos módulos)
CREATE TABLE IF NOT EXISTS public.oculto_social_beta_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_code TEXT NOT NULL REFERENCES public.oculto_social_beta_modules(code)
    ON UPDATE CASCADE ON DELETE CASCADE,
  category TEXT,
  level TEXT NOT NULL DEFAULT 'leve'
    CHECK (level IN ('leve','divertido','provocante','avancado')),
  content TEXT NOT NULL,
  payload JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_social_beta_cards_module_level
  ON public.oculto_social_beta_cards(module_code, level, enabled);

DROP TRIGGER IF EXISTS trg_oculto_social_beta_cards_updated_at
  ON public.oculto_social_beta_cards;
CREATE TRIGGER trg_oculto_social_beta_cards_updated_at
  BEFORE UPDATE ON public.oculto_social_beta_cards
  FOR EACH ROW EXECUTE FUNCTION public.oculto_touch_updated_at();

ALTER TABLE public.oculto_social_beta_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cards_read ON public.oculto_social_beta_cards;
CREATE POLICY cards_read ON public.oculto_social_beta_cards
  FOR SELECT TO authenticated USING (enabled OR public.social_beta_is_master());

DROP POLICY IF EXISTS cards_write_master ON public.oculto_social_beta_cards;
CREATE POLICY cards_write_master ON public.oculto_social_beta_cards
  FOR ALL TO authenticated
  USING (public.social_beta_is_master())
  WITH CHECK (public.social_beta_is_master());

-- 3) EVENTOS de rodada (telemetria/auditoria por sessão)
CREATE TABLE IF NOT EXISTS public.oculto_social_beta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.oculto_social_beta_sessions(id) ON DELETE CASCADE,
  module_code TEXT REFERENCES public.oculto_social_beta_modules(code) ON UPDATE CASCADE,
  card_id UUID REFERENCES public.oculto_social_beta_cards(id) ON DELETE SET NULL,
  actor_id UUID,
  target_id UUID,
  kind TEXT NOT NULL,
  level TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_social_beta_events_session_kind
  ON public.oculto_social_beta_events(session_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_social_beta_events_actor
  ON public.oculto_social_beta_events(actor_id, created_at DESC);

ALTER TABLE public.oculto_social_beta_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_read ON public.oculto_social_beta_events;
CREATE POLICY events_read ON public.oculto_social_beta_events
  FOR SELECT TO authenticated
  USING (
    public.social_beta_is_master()
    OR (session_id IS NOT NULL
        AND public.social_beta_is_participant(session_id, auth.uid()))
  );

DROP POLICY IF EXISTS events_insert ON public.oculto_social_beta_events;
CREATE POLICY events_insert ON public.oculto_social_beta_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.social_beta_is_master()
    OR (session_id IS NOT NULL
        AND public.social_beta_is_participant(session_id, auth.uid())
        AND (actor_id IS NULL OR actor_id = auth.uid()))
  );

DROP POLICY IF EXISTS events_master_modify ON public.oculto_social_beta_events;
CREATE POLICY events_master_modify ON public.oculto_social_beta_events
  FOR UPDATE TO authenticated
  USING (public.social_beta_is_master())
  WITH CHECK (public.social_beta_is_master());

DROP POLICY IF EXISTS events_master_delete ON public.oculto_social_beta_events;
CREATE POLICY events_master_delete ON public.oculto_social_beta_events
  FOR DELETE TO authenticated USING (public.social_beta_is_master());

-- 4) CONSENTIMENTO de uso
CREATE TABLE IF NOT EXISTS public.oculto_social_beta_consents (
  user_id UUID PRIMARY KEY,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_version TEXT NOT NULL DEFAULT 'v1',
  max_accepted_level TEXT NOT NULL DEFAULT 'provocante'
    CHECK (max_accepted_level IN ('leve','divertido','provocante','avancado')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_oculto_social_beta_consents_updated_at
  ON public.oculto_social_beta_consents;
CREATE TRIGGER trg_oculto_social_beta_consents_updated_at
  BEFORE UPDATE ON public.oculto_social_beta_consents
  FOR EACH ROW EXECUTE FUNCTION public.oculto_touch_updated_at();

ALTER TABLE public.oculto_social_beta_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consents_self_read ON public.oculto_social_beta_consents;
CREATE POLICY consents_self_read ON public.oculto_social_beta_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.social_beta_is_master());

DROP POLICY IF EXISTS consents_self_upsert ON public.oculto_social_beta_consents;
CREATE POLICY consents_self_upsert ON public.oculto_social_beta_consents
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS consents_self_update ON public.oculto_social_beta_consents;
CREATE POLICY consents_self_update ON public.oculto_social_beta_consents
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 5) RENOMEAÇÃO DINÂMICA (i18n overrides)
CREATE TABLE IF NOT EXISTS public.oculto_social_beta_i18n_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('module','menu','session','title','button','generic')),
  key TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  value TEXT NOT NULL,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, key, locale)
);

CREATE INDEX IF NOT EXISTS idx_oculto_social_beta_i18n_scope
  ON public.oculto_social_beta_i18n_overrides(scope, locale);

DROP TRIGGER IF EXISTS trg_oculto_social_beta_i18n_updated_at
  ON public.oculto_social_beta_i18n_overrides;
CREATE TRIGGER trg_oculto_social_beta_i18n_updated_at
  BEFORE UPDATE ON public.oculto_social_beta_i18n_overrides
  FOR EACH ROW EXECUTE FUNCTION public.oculto_touch_updated_at();

ALTER TABLE public.oculto_social_beta_i18n_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS i18n_read ON public.oculto_social_beta_i18n_overrides;
CREATE POLICY i18n_read ON public.oculto_social_beta_i18n_overrides
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS i18n_write_master ON public.oculto_social_beta_i18n_overrides;
CREATE POLICY i18n_write_master ON public.oculto_social_beta_i18n_overrides
  FOR ALL TO authenticated
  USING (public.social_beta_is_master())
  WITH CHECK (public.social_beta_is_master());

-- 6) SEED dos 9 módulos
INSERT INTO public.oculto_social_beta_modules
  (code, default_label, description, max_level, cooldown_seconds, allowed_context, enabled, sort_order)
VALUES
  ('conexao',        'Dados da Conexão',     'Quebra-gelo com perguntas rápidas para se apresentar.', 'divertido',  0, 'ambos', true, 10),
  ('verdade_escolha','Verdade ou Escolha',   'Sorteia perguntas e desafios curtos por nível.',         'provocante', 5, 'ambos', true, 20),
  ('roda',           'Roda da Interação',    'Roda gira e sorteia uma interação entre dois.',          'provocante', 8, 'grupo', true, 30),
  ('compatibilidade','Compatibilidade',      'Mini-quiz que estima afinidade entre participantes.',    'divertido', 10, 'ambos', true, 40),
  ('misterio',       'Mistério do Grupo',    'Pergunta anônima respondida por todos; revela padrão.',  'divertido',  5, 'grupo', true, 50),
  ('quem_combina',   'Quem Combina Mais',    'Cada um vota em quem mais combina com a frase sorteada.','provocante', 6, 'grupo', true, 60),
  ('duas_verdades',  'Duas Verdades',        'Dois fatos verdadeiros e um falso; o grupo adivinha.',   'divertido',  4, 'ambos', true, 70),
  ('energia',        'Energia Anônima',      'Envia uma “energia” anônima a outro participante.',      'provocante', 6, 'grupo', true, 80),
  ('duo',            'Modo Duo',             'Rodadas privadas para dois — somente quando duo.',       'provocante', 5, 'duo',   true, 90)
ON CONFLICT (code) DO UPDATE SET
  default_label    = EXCLUDED.default_label,
  description      = EXCLUDED.description,
  max_level        = EXCLUDED.max_level,
  cooldown_seconds = EXCLUDED.cooldown_seconds,
  allowed_context  = EXCLUDED.allowed_context,
  sort_order       = EXCLUDED.sort_order;

UPDATE public.oculto_social_beta_modules
   SET max_level = 'provocante'
 WHERE max_level = 'avancado';

-- 7) SEED de cartas iniciais
INSERT INTO public.oculto_social_beta_cards (module_code, category, level, content)
SELECT * FROM (VALUES
  ('conexao','pergunta','leve','Qual foi a melhor surpresa da sua semana?'),
  ('conexao','pergunta','leve','Diga uma coisa simples que te deixa feliz.'),
  ('conexao','pergunta','divertido','Qual hábito seu surpreende quem te conhece pouco?'),
  ('verdade_escolha','pergunta','leve','Conte algo que poucos sabem sobre você.'),
  ('verdade_escolha','desafio','divertido','Faça uma careta que descreva seu dia.'),
  ('roda','interacao','leve','Diga um elogio sincero a quem a roda apontou.'),
  ('roda','interacao','divertido','Conte rapidamente como vocês dois se conheceram (real ou inventado).'),
  ('compatibilidade','quiz','leve','Praia ou montanha?'),
  ('compatibilidade','quiz','leve','Festa grande ou jantar pequeno?'),
  ('misterio','anonimo','divertido','Qual a coisa mais corajosa que você já fez?'),
  ('quem_combina','frase','divertido','"Sempre chega atrasado mas com a melhor história."'),
  ('duas_verdades','rodada','leve','Diga três coisas sobre você: duas verdadeiras e uma falsa.'),
  ('energia','energia','leve','Envie boas vibrações a alguém do grupo.'),
  ('duo','pergunta','divertido','Que pequena tradição vocês poderiam inventar agora?')
) v(module_code, category, level, content)
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_social_beta_cards);

-- 8) Realtime para eventos
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime'
     AND schemaname='public'
     AND tablename='oculto_social_beta_events';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_social_beta_events';
  END IF;
END$$;

-- ============================================================
-- PARTE 2 — RPCs FRONTEND (Fatia 3.1)
-- ============================================================

CREATE OR REPLACE FUNCTION public.social_beta_list_modules(_locale TEXT DEFAULT 'pt-BR')
RETURNS TABLE (code TEXT, label TEXT, description TEXT, max_level TEXT, cooldown_seconds INT, allowed_context TEXT, enabled BOOLEAN, sort_order INT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    m.code,
    COALESCE(o.value, m.default_label) AS label,
    m.description,
    m.max_level,
    m.cooldown_seconds,
    m.allowed_context,
    m.enabled,
    m.sort_order
  FROM public.oculto_social_beta_modules m
  LEFT JOIN public.oculto_social_beta_i18n_overrides o
    ON o.scope = 'module' AND o.locale = _locale AND o.key = m.code
  WHERE m.enabled OR public.social_beta_is_master()
  ORDER BY m.sort_order ASC, m.default_label ASC;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_list_modules(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_draw_card(_session_id UUID, _module_code TEXT, _max_level TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, module_code TEXT, category TEXT, level TEXT, content TEXT, payload JSONB)
LANGUAGE PLPGSQL STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_module_max TEXT;
  v_consent_max TEXT;
  v_effective_max TEXT;
BEGIN
  IF _session_id IS NULL OR NOT public.social_beta_is_participant(_session_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  SELECT max_level INTO v_module_max
    FROM public.oculto_social_beta_modules
    WHERE code = _module_code AND enabled;
  IF v_module_max IS NULL THEN
    RAISE EXCEPTION 'module_not_found_or_disabled';
  END IF;

  SELECT COALESCE(max_accepted_level,'provocante') INTO v_consent_max
    FROM public.oculto_social_beta_consents WHERE user_id = auth.uid();
  v_consent_max := COALESCE(v_consent_max,'provocante');

  v_effective_max := (
    SELECT level FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) v(level, ord)
    WHERE ord = LEAST(
      (SELECT ord FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) WHERE x.level = COALESCE(_max_level, v_module_max)),
      (SELECT ord FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) WHERE x.level = v_module_max),
      (SELECT ord FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) WHERE x.level = v_consent_max)
    )
  );

  RETURN QUERY
    SELECT c.id, c.module_code, c.category, c.level, c.content, c.payload
    FROM public.oculto_social_beta_cards c
    WHERE c.module_code = _module_code
      AND c.enabled
      AND (SELECT ord FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) WHERE x.level = c.level)
        <= (SELECT ord FROM (VALUES ('leve',1),('divertido',2),('provocante',3),('avancado',4)) x(level,ord) WHERE x.level = v_effective_max)
    ORDER BY random()
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_draw_card(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_log_event(_session_id UUID, _module_code TEXT, _kind TEXT, _card_id UUID DEFAULT NULL, _target_id UUID DEFAULT NULL, _level TEXT DEFAULT NULL, _payload JSONB DEFAULT NULL)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF _session_id IS NULL OR NOT public.social_beta_is_participant(_session_id, auth.uid()) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  INSERT INTO public.oculto_social_beta_events (session_id, module_code, card_id, actor_id, target_id, kind, level, payload)
  VALUES (_session_id, _module_code, _card_id, auth.uid(), _target_id, _kind, _level, _payload)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_log_event(UUID, TEXT, TEXT, UUID, UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_accept_consent(_max_accepted_level TEXT DEFAULT 'provocante', _version TEXT DEFAULT 'v1')
RETURNS BOOLEAN
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _max_accepted_level NOT IN ('leve','divertido','provocante','avancado') THEN
    RAISE EXCEPTION 'invalid_level';
  END IF;
  INSERT INTO public.oculto_social_beta_consents (user_id, accepted_version, max_accepted_level)
  VALUES (auth.uid(), _version, _max_accepted_level)
  ON CONFLICT (user_id) DO UPDATE
    SET accepted_version = EXCLUDED.accepted_version,
        max_accepted_level = EXCLUDED.max_accepted_level,
        accepted_at = now(),
        updated_at = now();
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_accept_consent(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_my_consent()
RETURNS TABLE (accepted BOOLEAN, accepted_at TIMESTAMPTZ, version TEXT, max_accepted_level TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT true, c.accepted_at, c.accepted_version, c.max_accepted_level
  FROM public.oculto_social_beta_consents c
  WHERE c.user_id = auth.uid()
  UNION ALL
  SELECT false, null::timestamptz, null::text, null::text
  WHERE NOT EXISTS (SELECT 1 FROM public.oculto_social_beta_consents WHERE user_id = auth.uid())
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_my_consent() TO authenticated;

-- ============================================================
-- PARTE 3 — RPCs ADMIN (Fatia 3.2)
-- ============================================================

CREATE OR REPLACE FUNCTION public.social_beta_admin_list_modules()
RETURNS TABLE (id UUID, code TEXT, base_label TEXT, override_label TEXT, description TEXT, enabled BOOLEAN, max_level TEXT, cooldown_seconds INT, allowed_context TEXT, sort_order INT, cards_total INT, cards_by_level JSONB, updated_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    m.id,
    m.code,
    m.default_label,
    (SELECT value FROM public.oculto_social_beta_i18n_overrides o
       WHERE o.scope = 'module' AND o.key = m.code AND o.locale = 'pt-BR' LIMIT 1),
    m.description,
    m.enabled,
    m.max_level,
    m.cooldown_seconds,
    m.allowed_context,
    m.sort_order,
    (SELECT count(*)::int FROM public.oculto_social_beta_cards c WHERE c.module_code = m.code),
    (SELECT COALESCE(jsonb_object_agg(level, qty), '{}'::jsonb)
       FROM (SELECT level, count(*)::int AS qty FROM public.oculto_social_beta_cards WHERE module_code = m.code GROUP BY level) s),
    m.updated_at
  FROM public.oculto_social_beta_modules m
  WHERE public.social_beta_is_master()
  ORDER BY m.sort_order, m.default_label;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_list_modules() TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_upsert_module(_code TEXT, _default_label TEXT, _description TEXT, _enabled BOOLEAN, _max_level TEXT, _cooldown_seconds INT, _allowed_context TEXT, _sort_order INT)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.oculto_social_beta_modules (code, default_label, description, enabled, max_level, cooldown_seconds, allowed_context, sort_order)
  VALUES (_code, _default_label, _description, COALESCE(_enabled, true), COALESCE(_max_level, 'provocante'), COALESCE(_cooldown_seconds, 0), COALESCE(_allowed_context, 'ambos'), COALESCE(_sort_order, 0))
  ON CONFLICT (code) DO UPDATE
    SET default_label    = EXCLUDED.default_label,
        description      = EXCLUDED.description,
        enabled          = EXCLUDED.enabled,
        max_level        = EXCLUDED.max_level,
        cooldown_seconds = EXCLUDED.cooldown_seconds,
        allowed_context  = EXCLUDED.allowed_context,
        sort_order       = EXCLUDED.sort_order,
        updated_at       = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_upsert_module(TEXT, TEXT, TEXT, BOOLEAN, TEXT, INT, TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_set_i18n(_scope TEXT, _key TEXT, _locale TEXT, _value TEXT)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _value IS NULL OR LENGTH(BTRIM(_value)) = 0 THEN
    DELETE FROM public.oculto_social_beta_i18n_overrides
     WHERE scope = _scope AND key = _key AND locale = _locale;
  ELSE
    INSERT INTO public.oculto_social_beta_i18n_overrides (scope, key, locale, value)
    VALUES (_scope, _key, _locale, _value)
    ON CONFLICT (scope, key, locale) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now();
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_set_i18n(TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_list_cards(_module_code TEXT)
RETURNS TABLE (id UUID, module_code TEXT, category TEXT, level TEXT, content TEXT, enabled BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.module_code, c.category, c.level, c.content, c.enabled, c.created_at
    FROM public.oculto_social_beta_cards c
   WHERE c.module_code = _module_code AND public.social_beta_is_master()
   ORDER BY c.level, c.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_list_cards(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_upsert_card(_id UUID, _module_code TEXT, _category TEXT, _level TEXT, _content TEXT, _enabled BOOLEAN)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _level NOT IN ('leve','divertido','provocante','avancado') THEN RAISE EXCEPTION 'invalid_level'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oculto_social_beta_modules WHERE code = _module_code) THEN RAISE EXCEPTION 'module_not_found'; END IF;

  IF _id IS NULL THEN
    INSERT INTO public.oculto_social_beta_cards (module_code, category, level, content, enabled, created_by)
    VALUES (_module_code, _category, _level, _content, COALESCE(_enabled, true), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_social_beta_cards
       SET category = _category, level = _level, content = _content, enabled = COALESCE(_enabled, true)
     WHERE id = _id
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_upsert_card(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_delete_card(_id UUID)
RETURNS VOID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.oculto_social_beta_cards WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_delete_card(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_beta_admin_module_metrics(_days INT DEFAULT 30)
RETURNS TABLE (module_code TEXT, module_label TEXT, events_total INT, events_period INT, draws_period INT, answers_period INT, unique_users_period INT, last_event_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT e.*, m.default_label AS m_label, m.code AS m_code
      FROM public.oculto_social_beta_events e
      JOIN public.oculto_social_beta_modules m ON m.code = e.module_code
     WHERE public.social_beta_is_master()
  )
  SELECT
    m_code,
    m_label,
    count(*)::int,
    count(*) FILTER (WHERE created_at >= now() - make_interval(days => _days))::int,
    count(*) FILTER (WHERE kind = 'card_drawn' AND created_at >= now() - make_interval(days => _days))::int,
    count(*) FILTER (WHERE kind IN ('answer','answered') AND created_at >= now() - make_interval(days => _days))::int,
    count(DISTINCT actor_id) FILTER (WHERE created_at >= now() - make_interval(days => _days))::int,
    max(created_at)
  FROM base
  GROUP BY m_code, m_label
  ORDER BY 4 DESC, m_label;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_admin_module_metrics(INT) TO authenticated;

-- ============================================================
-- PARTE 4 — DENÚNCIAS DE CONTEÚDO (Fatia 3.4)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_social_beta_content_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type     TEXT NOT NULL CHECK (target_type IN ('module','card')),
  module_code     TEXT REFERENCES public.oculto_social_beta_modules(code) ON UPDATE CASCADE,
  card_id         UUID REFERENCES public.oculto_social_beta_cards(id) ON DELETE SET NULL,
  session_id      UUID REFERENCES public.oculto_social_beta_sessions(id) ON DELETE SET NULL,
  reporter_id     UUID NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_social_beta_content_reports_status
  ON public.oculto_social_beta_content_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_beta_content_reports_module
  ON public.oculto_social_beta_content_reports(module_code);
CREATE INDEX IF NOT EXISTS idx_social_beta_content_reports_card
  ON public.oculto_social_beta_content_reports(card_id);

ALTER TABLE public.oculto_social_beta_content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_reports_insert_self ON public.oculto_social_beta_content_reports;
CREATE POLICY content_reports_insert_self ON public.oculto_social_beta_content_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS content_reports_select_master ON public.oculto_social_beta_content_reports;
CREATE POLICY content_reports_select_master ON public.oculto_social_beta_content_reports
  FOR SELECT TO authenticated USING (public.social_beta_is_master());

DROP POLICY IF EXISTS content_reports_update_master ON public.oculto_social_beta_content_reports;
CREATE POLICY content_reports_update_master ON public.oculto_social_beta_content_reports
  FOR UPDATE TO authenticated
  USING (public.social_beta_is_master())
  WITH CHECK (public.social_beta_is_master());

-- Submeter denúncia
CREATE OR REPLACE FUNCTION public.social_beta_report_content(_target_type TEXT, _module_code TEXT DEFAULT NULL, _card_id UUID DEFAULT NULL, _session_id UUID DEFAULT NULL, _reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _target_type NOT IN ('module','card') THEN RAISE EXCEPTION 'invalid_target_type'; END IF;
  IF _target_type = 'module' AND _module_code IS NULL THEN RAISE EXCEPTION 'module_code_required'; END IF;
  IF _target_type = 'card' AND _card_id IS NULL THEN RAISE EXCEPTION 'card_id_required'; END IF;
  IF COALESCE(TRIM(_reason), '') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;

  IF (SELECT count(*) FROM public.oculto_social_beta_content_reports
      WHERE reporter_id = auth.uid() AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.oculto_social_beta_content_reports (target_type, module_code, card_id, session_id, reporter_id, reason)
  VALUES (_target_type, _module_code, _card_id, _session_id, auth.uid(), LEFT(_reason, 500))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_report_content(TEXT, TEXT, UUID, UUID, TEXT) TO authenticated;

-- Listagem master com agregados
CREATE OR REPLACE FUNCTION public.social_beta_list_content_reports(_status TEXT DEFAULT 'open', _limit INT DEFAULT 100)
RETURNS TABLE (id UUID, target_type TEXT, module_code TEXT, module_label TEXT, card_id UUID, card_content TEXT, card_level TEXT, session_id UUID, reporter_id UUID, reporter_username TEXT, reason TEXT, status TEXT, reports_count_for_target INT, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT r.* FROM public.oculto_social_beta_content_reports r
    WHERE public.social_beta_is_master() AND (_status = 'all' OR r.status = _status)
  ),
  counts AS (
    SELECT r.id, count(*) OVER (PARTITION BY r.target_type, COALESCE(r.module_code, ''), COALESCE(r.card_id::text, '')) AS cnt
    FROM public.oculto_social_beta_content_reports r WHERE r.status = 'open'
  )
  SELECT
    b.id, b.target_type, b.module_code, COALESCE(m.default_label, b.module_code) AS module_label,
    b.card_id, c.content AS card_content, c.level::text AS card_level, b.session_id,
    b.reporter_id, rp.username AS reporter_username, b.reason, b.status,
    COALESCE(cnt.cnt, 1)::int AS reports_count_for_target, b.created_at, b.resolved_at
  FROM base b
  LEFT JOIN public.oculto_social_beta_modules m ON m.code = b.module_code
  LEFT JOIN public.oculto_social_beta_cards c ON c.id = b.card_id
  LEFT JOIN public.profiles rp ON rp.user_id = b.reporter_id
  LEFT JOIN counts cnt ON cnt.id = b.id
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_list_content_reports(TEXT, INT) TO authenticated;

-- Resolver / arquivar denúncia
CREATE OR REPLACE FUNCTION public.social_beta_resolve_content_report(_report_id UUID, _action TEXT, _note TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _action NOT IN ('resolved','archived','open') THEN RAISE EXCEPTION 'invalid_action'; END IF;

  UPDATE public.oculto_social_beta_content_reports
     SET status = _action,
         resolved_at = CASE WHEN _action = 'open' THEN null ELSE now() END,
         resolved_by = CASE WHEN _action = 'open' THEN null ELSE auth.uid() END,
         resolution_note = COALESCE(_note, resolution_note)
   WHERE id = _report_id;
  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_resolve_content_report(UUID, TEXT, TEXT) TO authenticated;

-- Desativar alvo (módulo ou card) + resolver pendências
CREATE OR REPLACE FUNCTION public.social_beta_disable_target(_target_type TEXT, _module_code TEXT DEFAULT NULL, _card_id UUID DEFAULT NULL, _note TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.social_beta_is_master() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _target_type NOT IN ('module','card') THEN RAISE EXCEPTION 'invalid_target_type'; END IF;

  IF _target_type = 'module' THEN
    IF _module_code IS NULL THEN RAISE EXCEPTION 'module_code_required'; END IF;
    UPDATE public.oculto_social_beta_modules SET enabled = false, updated_at = now() WHERE code = _module_code;
    UPDATE public.oculto_social_beta_content_reports
       SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = COALESCE(_note, 'Módulo desativado pelo master')
     WHERE module_code = _module_code AND target_type = 'module' AND status = 'open';
  ELSE
    IF _card_id IS NULL THEN RAISE EXCEPTION 'card_id_required'; END IF;
    UPDATE public.oculto_social_beta_cards SET enabled = false WHERE id = _card_id;
    UPDATE public.oculto_social_beta_content_reports
       SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = COALESCE(_note, 'Card desativado pelo master')
     WHERE card_id = _card_id AND target_type = 'card' AND status = 'open';
  END IF;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.social_beta_disable_target(TEXT, TEXT, UUID, TEXT) TO authenticated;
```