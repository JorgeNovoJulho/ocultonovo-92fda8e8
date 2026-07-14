-- =============================================================================
-- CICLOS SOCIAIS ESPECIAIS + SALAS TEMÁTICAS TEMPORÁRIAS
-- Backend: Supabase externo (rvybbrkzmboqbhcemqar). Idempotente.
-- Conceito:
--   • Definições de ciclos especiais (clima/horário/requisitos).
--   • Sessões abertas com prazo de fechamento (até 180 min).
--   • Sorteio de presentes em XP no chat: 5 primeiros vencem, cooldown 5 rounds.
--   • Avisos 30/15/5 min e fechamento que expulsa todos e bloqueia visualização
--     (exceto Master Admin).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Mensagens do sistema dentro do chat da sala
-- ---------------------------------------------------------------------------
ALTER TABLE public.oculto_aura_room_messages
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE public.oculto_aura_room_messages
  ADD COLUMN IF NOT EXISTS system_kind text NULL;

-- Permite linhas com user_id sintético do sistema (não FK).
DO $$
BEGIN
  ALTER TABLE public.oculto_aura_room_messages
    ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN
  -- ignora se já é nullable
  NULL;
END$$;

-- ---------------------------------------------------------------------------
-- 1) Definições
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_special_cycle_definitions (
  key                   text PRIMARY KEY,
  label                 text NOT NULL,
  emoji                 text NOT NULL DEFAULT '✨',
  hue                   int  NOT NULL DEFAULT 280,
  room_slug             text NOT NULL,
  weather_kinds         text[] NOT NULL DEFAULT '{}',
  day_parts             text[] NOT NULL DEFAULT '{}',
  min_temp              numeric NULL,
  max_temp              numeric NULL,
  min_aura_level        int NOT NULL DEFAULT 0,
  min_social_score      int NOT NULL DEFAULT 0,
  min_prestige_xp       int NOT NULL DEFAULT 0,
  required_plan         text NULL,
  requires_kyc          boolean NOT NULL DEFAULT false,
  max_duration_minutes  int NOT NULL DEFAULT 180,
  active                boolean NOT NULL DEFAULT true,
  description           text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_special_cycle_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scd_read"  ON public.oculto_special_cycle_definitions;
CREATE POLICY "scd_read" ON public.oculto_special_cycle_definitions
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2) Sessões abertas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_special_cycle_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_key        text NOT NULL REFERENCES public.oculto_special_cycle_definitions(key) ON DELETE CASCADE,
  room_slug        text NOT NULL,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  closes_at        timestamptz NOT NULL,
  closed_at        timestamptz NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closing','closed')),
  notify_30_sent   boolean NOT NULL DEFAULT false,
  notify_15_sent   boolean NOT NULL DEFAULT false,
  notify_5_sent    boolean NOT NULL DEFAULT false,
  notice_message   text NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_special_session_open_per_cycle
  ON public.oculto_special_cycle_sessions (cycle_key)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_special_session_room_status
  ON public.oculto_special_cycle_sessions (room_slug, status);

ALTER TABLE public.oculto_special_cycle_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scs_read" ON public.oculto_special_cycle_sessions;
CREATE POLICY "scs_read" ON public.oculto_special_cycle_sessions
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 3) Rounds de XP
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_special_room_xp_rounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.oculto_special_cycle_sessions(id) ON DELETE CASCADE,
  round_no     int  NOT NULL,
  xp_amount    int  NOT NULL,
  max_winners  int  NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  closed_at    timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_xp_round_session_no
  ON public.oculto_special_room_xp_rounds (session_id, round_no);
CREATE INDEX IF NOT EXISTS idx_xp_round_session_open
  ON public.oculto_special_room_xp_rounds (session_id, closed_at);

ALTER TABLE public.oculto_special_room_xp_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xpr_read" ON public.oculto_special_room_xp_rounds;
CREATE POLICY "xpr_read" ON public.oculto_special_room_xp_rounds
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.oculto_special_room_xp_claims (
  round_id    uuid NOT NULL REFERENCES public.oculto_special_room_xp_rounds(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  xp_amount   int  NOT NULL,
  position    int  NOT NULL,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);
ALTER TABLE public.oculto_special_room_xp_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "xpc_read" ON public.oculto_special_room_xp_claims;
CREATE POLICY "xpc_read" ON public.oculto_special_room_xp_claims
  FOR SELECT TO authenticated USING (true);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_special_cycle_sessions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_special_cycle_sessions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_special_room_xp_rounds') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_special_room_xp_rounds';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_special_room_xp_claims') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_special_room_xp_claims';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
-- Postar mensagem do sistema (sem user_id e bypassa rate-limit / presença)
CREATE OR REPLACE FUNCTION public._special_post_system_message(p_slug text, p_body text, p_kind text DEFAULT 'system')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body, is_system, system_kind)
  VALUES (p_slug, NULL, p_body, true, p_kind)
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;

-- Verifica se há sessão especial ATIVA para uma sala (qualquer ciclo)
CREATE OR REPLACE FUNCTION public.special_room_session_for_slug(p_slug text)
RETURNS TABLE(id uuid, cycle_key text, opened_at timestamptz, closes_at timestamptz, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.cycle_key, s.opened_at, s.closes_at, s.status
  FROM public.oculto_special_cycle_sessions s
  WHERE s.room_slug = p_slug AND s.status IN ('open','closing')
  ORDER BY s.opened_at DESC LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 5) special_room_active — retorna sessão para um ciclo (ou qualquer aberta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.special_room_active(p_cycle_key text DEFAULT NULL)
RETURNS TABLE(
  id uuid, cycle_key text, room_slug text, label text, emoji text, hue int,
  opened_at timestamptz, closes_at timestamptz, status text,
  min_aura_level int, min_social_score int, min_prestige_xp int,
  required_plan text, requires_kyc boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.cycle_key, s.room_slug, d.label, d.emoji, d.hue,
         s.opened_at, s.closes_at, s.status,
         d.min_aura_level, d.min_social_score, d.min_prestige_xp,
         d.required_plan, d.requires_kyc
  FROM public.oculto_special_cycle_sessions s
  JOIN public.oculto_special_cycle_definitions d ON d.key = s.cycle_key
  WHERE s.status = 'open'
    AND (p_cycle_key IS NULL OR s.cycle_key = p_cycle_key)
  ORDER BY s.opened_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.special_room_active(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.special_room_session_for_slug(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6) Avaliar e abrir ciclo (chamado pelo cron)
-- ---------------------------------------------------------------------------
-- Versão inicial: avalia por day_part (TZ America/Sao_Paulo) e abre se
-- nenhuma sessão ativa existe para o ciclo. Clima opcional (admin define depois).
CREATE OR REPLACE FUNCTION public.special_cycle_evaluate_and_open()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hour int := EXTRACT(HOUR FROM (now() at time zone 'America/Sao_Paulo'))::int;
  v_part text := CASE
    WHEN v_hour BETWEEN 0 AND 5 THEN 'madrugada'
    WHEN v_hour BETWEEN 6 AND 11 THEN 'manha'
    WHEN v_hour BETWEEN 12 AND 17 THEN 'tarde'
    ELSE 'noite'
  END;
  v_opened int := 0;
  v_def record;
  v_session_id uuid;
BEGIN
  FOR v_def IN
    SELECT * FROM public.oculto_special_cycle_definitions
    WHERE active = true
      AND (cardinality(day_parts)=0 OR v_part = ANY(day_parts))
  LOOP
    -- pula se já tem sessão aberta
    IF EXISTS (SELECT 1 FROM public.oculto_special_cycle_sessions
               WHERE cycle_key = v_def.key AND status = 'open') THEN
      CONTINUE;
    END IF;

    INSERT INTO public.oculto_special_cycle_sessions(cycle_key, room_slug, closes_at, status)
    VALUES (v_def.key, v_def.room_slug,
            now() + make_interval(mins => v_def.max_duration_minutes), 'open')
    RETURNING id INTO v_session_id;

    PERFORM public._special_post_system_message(
      v_def.room_slug,
      v_def.emoji || ' Ciclo especial "' || v_def.label || '" começou! Fecha em ' || v_def.max_duration_minutes || ' min.',
      'cycle_open'
    );
    v_opened := v_opened + 1;
  END LOOP;

  RETURN v_opened;
END;$$;
GRANT EXECUTE ON FUNCTION public.special_cycle_evaluate_and_open() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Fechar sessão (cron + admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.special_room_close(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess record;
BEGIN
  SELECT * INTO v_sess FROM public.oculto_special_cycle_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_found'); END IF;
  IF v_sess.status = 'closed' THEN RETURN jsonb_build_object('ok', true, 'already_closed', true); END IF;

  PERFORM public._special_post_system_message(
    v_sess.room_slug,
    '🔒 Sala especial encerrada. Continue a conversa em outras salas do Aura Match.',
    'cycle_close'
  );

  -- Expulsa todos
  DELETE FROM public.oculto_aura_room_presence WHERE room_slug = v_sess.room_slug;

  UPDATE public.oculto_special_cycle_sessions
     SET status='closed', closed_at = now()
   WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true);
END;$$;
GRANT EXECUTE ON FUNCTION public.special_room_close(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Tick do cron: notices 30/15/5 e fechamento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.special_cycle_tick()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess record;
  v_remaining_min int;
  v_closed int := 0;
  v_noticed int := 0;
BEGIN
  -- abre o que precisa
  PERFORM public.special_cycle_evaluate_and_open();

  FOR v_sess IN
    SELECT * FROM public.oculto_special_cycle_sessions WHERE status = 'open'
  LOOP
    v_remaining_min := GREATEST(0, EXTRACT(EPOCH FROM (v_sess.closes_at - now()))::int / 60);

    IF v_remaining_min <= 0 THEN
      PERFORM public.special_room_close(v_sess.id);
      v_closed := v_closed + 1;
      CONTINUE;
    END IF;

    IF v_remaining_min <= 5 AND NOT v_sess.notify_5_sent THEN
      PERFORM public._special_post_system_message(v_sess.room_slug,
        '⏳ Esta sala especial fecha em 5 minutos. Aproveite os últimos momentos!', 'notice_5');
      UPDATE public.oculto_special_cycle_sessions SET notify_5_sent = true WHERE id = v_sess.id;
      v_noticed := v_noticed + 1;
    ELSIF v_remaining_min <= 15 AND NOT v_sess.notify_15_sent THEN
      PERFORM public._special_post_system_message(v_sess.room_slug,
        '⏳ 15 minutos para o encerramento desta sala especial.', 'notice_15');
      UPDATE public.oculto_special_cycle_sessions SET notify_15_sent = true WHERE id = v_sess.id;
      v_noticed := v_noticed + 1;
    ELSIF v_remaining_min <= 30 AND NOT v_sess.notify_30_sent THEN
      PERFORM public._special_post_system_message(v_sess.room_slug,
        '⏳ 30 minutos para o encerramento. Continue a conversa em outras salas depois.', 'notice_30');
      UPDATE public.oculto_special_cycle_sessions SET notify_30_sent = true WHERE id = v_sess.id;
      v_noticed := v_noticed + 1;
    END IF;
  END LOOP;

  -- distribui presentes automaticamente
  PERFORM public.special_room_auto_distribute();

  RETURN jsonb_build_object('closed', v_closed, 'noticed', v_noticed);
END;$$;
GRANT EXECUTE ON FUNCTION public.special_cycle_tick() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) Sorteio de XP: abrir round + claim atômico + auto-distribute
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.special_room_xp_open_round(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess record;
  v_xp int;
  v_no int;
  v_id uuid;
BEGIN
  SELECT * INTO v_sess FROM public.oculto_special_cycle_sessions WHERE id = p_session_id;
  IF NOT FOUND OR v_sess.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'reason','session_not_open');
  END IF;

  -- não abre se há round aberto
  IF EXISTS (SELECT 1 FROM public.oculto_special_room_xp_rounds
             WHERE session_id = p_session_id AND closed_at IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason','round_open');
  END IF;

  v_xp := 50 + (floor(random() * 46)::int) * 10;  -- 50..500 múltiplos de 10
  SELECT COALESCE(MAX(round_no), 0) + 1 INTO v_no
    FROM public.oculto_special_room_xp_rounds WHERE session_id = p_session_id;

  INSERT INTO public.oculto_special_room_xp_rounds(session_id, round_no, xp_amount)
  VALUES (p_session_id, v_no, v_xp)
  RETURNING id INTO v_id;

  PERFORM public._special_post_system_message(
    v_sess.room_slug,
    '🎁 Presente surpresa: ' || v_xp || ' XP para os 5 primeiros! Abra o card e clique em "Pegar".',
    'xp_round_open'
  );

  RETURN jsonb_build_object('ok', true, 'round_id', v_id, 'xp', v_xp, 'round_no', v_no);
END;$$;
GRANT EXECUTE ON FUNCTION public.special_room_xp_open_round(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.special_room_xp_claim(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_round record;
  v_sess record;
  v_count int;
  v_recent_block int;
  v_position int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason','auth_required'); END IF;

  SELECT * INTO v_round FROM public.oculto_special_room_xp_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','round_not_found'); END IF;
  IF v_round.closed_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason','round_closed'); END IF;

  SELECT * INTO v_sess FROM public.oculto_special_cycle_sessions WHERE id = v_round.session_id;
  IF v_sess.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'reason','session_closed'); END IF;

  -- Cooldown: usuário pegou em alguma das últimas 5 rounds desta sessão?
  SELECT COUNT(*) INTO v_recent_block
  FROM public.oculto_special_room_xp_claims c
  WHERE c.user_id = v_uid
    AND c.round_id IN (
      SELECT id FROM public.oculto_special_room_xp_rounds
      WHERE session_id = v_round.session_id
        AND id <> p_round_id
      ORDER BY round_no DESC
      LIMIT 5
    );
  IF v_recent_block > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason','cooldown', 'rounds_to_wait', 5);
  END IF;

  -- Já reivindicou esta round?
  IF EXISTS (SELECT 1 FROM public.oculto_special_room_xp_claims
             WHERE round_id = p_round_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason','already_claimed');
  END IF;

  -- Lotado?
  SELECT COUNT(*) INTO v_count FROM public.oculto_special_room_xp_claims WHERE round_id = p_round_id;
  IF v_count >= v_round.max_winners THEN
    UPDATE public.oculto_special_room_xp_rounds SET closed_at = now() WHERE id = p_round_id AND closed_at IS NULL;
    RETURN jsonb_build_object('ok', false, 'reason','full');
  END IF;
  v_position := v_count + 1;

  INSERT INTO public.oculto_special_room_xp_claims(round_id, user_id, xp_amount, position)
  VALUES (p_round_id, v_uid, v_round.xp_amount, v_position);

  -- Credita XP — aura_award_xp usa auth.uid()
  PERFORM public.aura_award_xp(v_round.xp_amount, 'special_room_gift:' || v_round.session_id::text);

  -- Fecha se completou
  IF v_position >= v_round.max_winners THEN
    UPDATE public.oculto_special_room_xp_rounds SET closed_at = now() WHERE id = p_round_id;
    PERFORM public._special_post_system_message(v_sess.room_slug,
      '✅ Round encerrado — 5 vencedores levaram ' || v_round.xp_amount || ' XP cada.', 'xp_round_closed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'xp', v_round.xp_amount, 'position', v_position);
END;$$;
GRANT EXECUTE ON FUNCTION public.special_room_xp_claim(uuid) TO authenticated;

-- Auto-distribute: abre round se não há aberto e o último foi há ≥ 8 min,
-- desde que haja ≥ 3 participantes ativos.
CREATE OR REPLACE FUNCTION public.special_room_auto_distribute()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sess record;
  v_active int;
  v_last_at timestamptz;
  v_opened int := 0;
BEGIN
  FOR v_sess IN SELECT * FROM public.oculto_special_cycle_sessions WHERE status='open' LOOP
    SELECT COUNT(*) INTO v_active FROM public.oculto_aura_room_presence
     WHERE room_slug = v_sess.room_slug
       AND is_observer = false
       AND last_ping > now() - interval '5 minutes';
    IF v_active < 3 THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM public.oculto_special_room_xp_rounds
               WHERE session_id = v_sess.id AND closed_at IS NULL) THEN
      CONTINUE;
    END IF;

    SELECT MAX(created_at) INTO v_last_at FROM public.oculto_special_room_xp_rounds
     WHERE session_id = v_sess.id;
    IF v_last_at IS NOT NULL AND v_last_at > now() - interval '8 minutes' THEN
      CONTINUE;
    END IF;

    PERFORM public.special_room_xp_open_round(v_sess.id);
    v_opened := v_opened + 1;
  END LOOP;
  RETURN v_opened;
END;$$;
GRANT EXECUTE ON FUNCTION public.special_room_auto_distribute() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10) Bloqueio de envio e visualização em sessão fechada (exceto Master)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_room_post_message(
  p_slug text,
  p_body text,
  p_reply_to uuid DEFAULT NULL,
  p_mentions text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_body     text := btrim(coalesce(p_body, ''));
  v_recent   int;
  v_id       uuid;
  v_present  boolean;
  v_open     boolean;
  v_master   boolean;
  v_gates    jsonb;
  v_allowed  boolean;
  v_mentions text[] := COALESCE(p_mentions, '{}'::text[]);
  v_special  record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF length(v_body) < 1 OR length(v_body) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length');
  END IF;

  v_master := public._aura_is_master(v_uid);

  -- Bloqueia salas com sessão especial encerrada (exceto Master)
  SELECT * INTO v_special FROM public.oculto_special_cycle_sessions
   WHERE room_slug = p_slug
   ORDER BY opened_at DESC LIMIT 1;
  IF v_special.id IS NOT NULL AND v_special.status = 'closed' AND NOT v_master THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'special_room_closed');
  END IF;

  SELECT COALESCE(open_to_all, false) INTO v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;

  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE
      SET last_ping = now(), is_observer = false;
  ELSE
    v_gates   := public._aura_room_check_gates(p_slug, v_uid);
    v_allowed := COALESCE((v_gates->>'allowed')::boolean, false);
    IF v_open OR v_allowed THEN
      INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
      VALUES (p_slug, v_uid, false, now())
      ON CONFLICT (room_slug, user_id) DO UPDATE
        SET last_ping = now(), is_observer = false;
    ELSE
      RETURN jsonb_build_object('ok', false, 'reason', 'observer_only');
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.oculto_aura_room_presence
     WHERE room_slug = p_slug AND user_id = v_uid
       AND is_observer = false AND last_ping > now() - interval '10 minutes'
  ) INTO v_present;
  IF NOT v_present THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_present');
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.oculto_aura_room_messages
   WHERE room_slug = p_slug AND user_id = v_uid
     AND created_at > now() - interval '30 seconds';
  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body, reply_to_id, mentions)
  VALUES (p_slug, v_uid, v_body, p_reply_to, v_mentions)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;$$;
GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text, uuid, text[]) TO authenticated;

-- Atualiza aura_room_recent_messages para esconder histórico de sala
-- com sessão closed (exceto Master).
DROP FUNCTION IF EXISTS public.aura_room_recent_messages(text, int);
CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  body        text,
  created_at  timestamptz,
  name        text,
  username    text,
  avatar_url  text,
  plan_type   text,
  is_verified boolean,
  is_system   boolean,
  system_kind text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_master boolean := public._aura_is_master(v_uid);
  v_special_closed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_special_cycle_sessions
     WHERE room_slug = p_slug AND status = 'closed'
       AND NOT EXISTS (
         SELECT 1 FROM public.oculto_special_cycle_sessions s2
         WHERE s2.room_slug = p_slug AND s2.status IN ('open','closing')
       )
  ) INTO v_special_closed;

  IF v_special_closed AND NOT v_master THEN
    RETURN; -- nada visível
  END IF;

  RETURN QUERY
  SELECT m.id, m.user_id, m.body, m.created_at,
         p.name, p.username, p.avatar_url, p.plan_type, p.is_verified,
         m.is_system, m.system_kind
  FROM public.oculto_aura_room_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_slug = p_slug
    AND m.created_at > now() - interval '6 hours'
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 40), 80));
END;$$;
GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11) Seeds — definições iniciais (idempotente via upsert)
-- ---------------------------------------------------------------------------
INSERT INTO public.oculto_special_cycle_definitions
  (key, label, emoji, hue, room_slug, day_parts, weather_kinds, min_aura_level, max_duration_minutes, description)
VALUES
  ('pico_noite',         'Pico da Noite',         '🌆', 320, 'tema_livre', ARRAY['noite'],     ARRAY[]::text[], 0, 180, 'Sala especial nos horários de pico noturno.'),
  ('calmaria_madrugada', 'Madrugada Acordada',    '🌙', 260, 'tema_livre', ARRAY['madrugada'], ARRAY[]::text[], 2, 180, 'Quebra a calmaria com encontros discretos.'),
  ('bom_dia_social',     'Bom dia Social',        '🌅', 25,  'tema_livre', ARRAY['manha'],     ARRAY[]::text[], 0, 120, 'Energia matinal — afinidades do dia.'),
  ('aconchego_chuvoso',  'Aconchego Chuvoso',     '🌧️', 200, 'tema_livre', ARRAY['tarde','noite'], ARRAY['rain','storm'], 0, 150, 'Bate-papo aconchegante quando chove.'),
  ('esquenta_frio',      'Esquenta o Clima',      '❄️', 210, 'tema_livre', ARRAY['noite','madrugada'], ARRAY['cold','snow'], 1, 150, 'Aqueça o clima conhecendo gente nova.')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  emoji = EXCLUDED.emoji,
  hue   = EXCLUDED.hue,
  room_slug = EXCLUDED.room_slug,
  day_parts = EXCLUDED.day_parts,
  weather_kinds = EXCLUDED.weather_kinds,
  description = EXCLUDED.description,
  updated_at = now();
