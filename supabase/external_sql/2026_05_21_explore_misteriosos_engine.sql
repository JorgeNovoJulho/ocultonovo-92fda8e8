-- ============================================================================
-- Evolução dos cards "Explorar novos misteriosos(as)"
-- Reutiliza: looking_now_matches (matches), aura_send_xp_gift (presente XP),
--            get_or_create_conversation (chat), profiles, system_settings.
-- Não cria sistema duplicado.
-- Idempotente.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) IGNORAR — usuário some do carrossel por N dias
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oculto_discovery_ignores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id uuid NOT NULL,           -- quem ignorou (profiles.id)
  target_profile_id uuid NOT NULL,         -- quem foi ignorado (profiles.id)
  source          text NOT NULL DEFAULT 'explorar_misteriosos',
  ignored_until   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_profile_id, target_profile_id, source)
);

CREATE INDEX IF NOT EXISTS idx_discovery_ignores_user_until
  ON public.oculto_discovery_ignores (user_profile_id, ignored_until DESC);

ALTER TABLE public.oculto_discovery_ignores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own ignores" ON public.oculto_discovery_ignores;
CREATE POLICY "owner reads own ignores"
  ON public.oculto_discovery_ignores
  FOR SELECT TO authenticated
  USING (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- 2) APROXIMAR — interesse direcionado (vira match quando recíproco)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oculto_discovery_likes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id   uuid NOT NULL,
  target_profile_id uuid NOT NULL,
  source            text NOT NULL DEFAULT 'explorar_misteriosos',
  status            text NOT NULL DEFAULT 'pending', -- pending | matched | cancelled
  matched_at        timestamptz,
  match_id          uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_profile_id, target_profile_id, source)
);

CREATE INDEX IF NOT EXISTS idx_discovery_likes_target_status
  ON public.oculto_discovery_likes (target_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_discovery_likes_user
  ON public.oculto_discovery_likes (user_profile_id, created_at DESC);

ALTER TABLE public.oculto_discovery_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own likes" ON public.oculto_discovery_likes;
CREATE POLICY "owner reads own likes"
  ON public.oculto_discovery_likes
  FOR SELECT TO authenticated
  USING (user_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "target reads incoming likes" ON public.oculto_discovery_likes;
CREATE POLICY "target reads incoming likes"
  ON public.oculto_discovery_likes
  FOR SELECT TO authenticated
  USING (target_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- 3) LOG presentes vindos da descoberta (cooldown anti-spam por par)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oculto_discovery_gift_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_profile_id uuid NOT NULL,
  target_profile_id uuid NOT NULL,
  conversation_id   uuid,
  message_id        uuid,
  amount            integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discovery_gift_log_pair
  ON public.oculto_discovery_gift_log (sender_profile_id, target_profile_id, created_at DESC);

ALTER TABLE public.oculto_discovery_gift_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner reads own gift log" ON public.oculto_discovery_gift_log;
CREATE POLICY "owner reads own gift log"
  ON public.oculto_discovery_gift_log
  FOR SELECT TO authenticated
  USING (sender_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────────────────────
-- Helper interno: resolve auth.uid -> profile.id
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._discovery_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: IGNORAR
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discovery_ignore_user(uuid, integer);

CREATE OR REPLACE FUNCTION public.discovery_ignore_user(
  p_target_profile_id uuid,
  p_days integer DEFAULT 30
) RETURNS TABLE (ok boolean, reason text, ignored_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := public._discovery_my_profile_id();
  v_until timestamptz;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, NULL::timestamptz; RETURN;
  END IF;
  IF p_target_profile_id IS NULL OR p_target_profile_id = v_me THEN
    RETURN QUERY SELECT false, 'invalid_target'::text, NULL::timestamptz; RETURN;
  END IF;

  v_until := now() + make_interval(days => GREATEST(1, COALESCE(p_days, 30)));

  INSERT INTO public.oculto_discovery_ignores
    (user_profile_id, target_profile_id, source, ignored_until)
  VALUES (v_me, p_target_profile_id, 'explorar_misteriosos', v_until)
  ON CONFLICT (user_profile_id, target_profile_id, source)
  DO UPDATE SET ignored_until = EXCLUDED.ignored_until;

  RETURN QUERY SELECT true, 'ignored'::text, v_until;
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_ignore_user(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_ignore_user(uuid, integer) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: APROXIMAR (cria match recíproco em looking_now_matches)
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discovery_approach_user(uuid);

CREATE OR REPLACE FUNCTION public.discovery_approach_user(
  p_target_profile_id uuid
) RETURNS TABLE (ok boolean, reason text, matched boolean, match_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := public._discovery_my_profile_id();
  v_reciprocal_id uuid;
  v_match_id uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_blocked boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, false, NULL::uuid; RETURN;
  END IF;
  IF p_target_profile_id IS NULL OR p_target_profile_id = v_me THEN
    RETURN QUERY SELECT false, 'invalid_target'::text, false, NULL::uuid; RETURN;
  END IF;

  -- Bloqueio mútuo? (tabela blocked_contacts caso exista)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='blocked_contacts'
  ) THEN
    EXECUTE format($f$
      SELECT EXISTS (
        SELECT 1 FROM public.blocked_contacts bc
         JOIN public.profiles pa ON pa.user_id = bc.user_id
         JOIN public.profiles pb ON pb.user_id = bc.blocked_user_id
         WHERE (pa.id = %L AND pb.id = %L) OR (pa.id = %L AND pb.id = %L)
      )
    $f$, v_me, p_target_profile_id, p_target_profile_id, v_me)
    INTO v_blocked;
  END IF;
  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::text, false, NULL::uuid; RETURN;
  END IF;

  -- Registra/atualiza like
  INSERT INTO public.oculto_discovery_likes
    (user_profile_id, target_profile_id, source, status)
  VALUES (v_me, p_target_profile_id, 'explorar_misteriosos', 'pending')
  ON CONFLICT (user_profile_id, target_profile_id, source)
  DO UPDATE SET status = CASE
    WHEN public.oculto_discovery_likes.status = 'matched'
    THEN 'matched' ELSE 'pending' END;

  -- Like recíproco ainda pendente?
  SELECT id INTO v_reciprocal_id
    FROM public.oculto_discovery_likes
   WHERE user_profile_id = p_target_profile_id
     AND target_profile_id = v_me
     AND source = 'explorar_misteriosos'
     AND status IN ('pending','matched')
   LIMIT 1;

  IF v_reciprocal_id IS NULL THEN
    RETURN QUERY SELECT true, 'pending'::text, false, NULL::uuid; RETURN;
  END IF;

  -- Reciprocal! Criar match em looking_now_matches (UNIQUE par)
  v_user1 := LEAST(v_me, p_target_profile_id);
  v_user2 := GREATEST(v_me, p_target_profile_id);

  SELECT id INTO v_match_id FROM public.looking_now_matches
   WHERE user1_id = v_user1 AND user2_id = v_user2 LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.looking_now_matches
      (user1_id, user2_id, distance_km, matched_at, is_super_match)
    VALUES (v_user1, v_user2, 0, now(), false)
    ON CONFLICT (user1_id, user2_id) DO UPDATE
       SET matched_at = EXCLUDED.matched_at,
           is_expired = false
    RETURNING id INTO v_match_id;
  ELSE
    UPDATE public.looking_now_matches
       SET is_expired = false, matched_at = now()
     WHERE id = v_match_id;
  END IF;

  UPDATE public.oculto_discovery_likes
     SET status = 'matched', matched_at = now(), match_id = v_match_id
   WHERE source = 'explorar_misteriosos'
     AND ((user_profile_id = v_me AND target_profile_id = p_target_profile_id)
       OR (user_profile_id = p_target_profile_id AND target_profile_id = v_me));

  RETURN QUERY SELECT true, 'matched'::text, true, v_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_approach_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_approach_user(uuid) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- RPC: Mensagem automática contextual após presente
-- (chamada pelo client APÓS aura_send_xp_gift retornar sucesso)
-- Cooldown 6h por par para não virar spam.
-- ──────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.discovery_send_gift_autoreply(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.discovery_send_gift_autoreply(
  p_target_profile_id uuid,
  p_amount integer,
  p_message text DEFAULT NULL
) RETURNS TABLE (ok boolean, reason text, conversation_id uuid, message_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me_profile uuid := public._discovery_my_profile_id();
  v_me_uid uuid := auth.uid();
  v_target_uid uuid;
  v_conv_id uuid;
  v_msg_id uuid;
  v_last timestamptz;
  v_text text;
  v_templates text[] := ARRAY[
    '🎁 Te enviei um presente porque sua energia chamou minha atenção aqui no Oculto. Quero te conhecer melhor. 💜',
    '💜 Vi seu perfil em Explorar Misteriosos e te enviei um presente — fiquei curioso(a) pra saber mais sobre você.',
    '⚡ Seu perfil apareceu pra mim e despertou minha curiosidade. Te mandei uma energia pra começar essa conexão.',
    '🔥 Te enviei um presente de XP… agora quero descobrir quem é você por trás desse mistério.'
  ];
BEGIN
  IF v_me_uid IS NULL OR v_me_profile IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF p_target_profile_id IS NULL OR p_target_profile_id = v_me_profile THEN
    RETURN QUERY SELECT false, 'invalid_target'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  -- Cooldown 6h
  SELECT MAX(created_at) INTO v_last
    FROM public.oculto_discovery_gift_log
   WHERE sender_profile_id = v_me_profile
     AND target_profile_id = p_target_profile_id;
  IF v_last IS NOT NULL AND now() - v_last < interval '6 hours' THEN
    RETURN QUERY SELECT false, 'cooldown'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  SELECT user_id INTO v_target_uid FROM public.profiles WHERE id = p_target_profile_id LIMIT 1;
  IF v_target_uid IS NULL THEN
    RETURN QUERY SELECT false, 'target_not_found'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  -- Cria/recupera conversa entre os user_ids (auth.users)
  SELECT public.get_or_create_conversation(v_me_uid, v_target_uid) INTO v_conv_id;
  IF v_conv_id IS NULL THEN
    RETURN QUERY SELECT false, 'conversation_failed'::text, NULL::uuid, NULL::uuid; RETURN;
  END IF;

  -- Escolhe mensagem
  v_text := COALESCE(NULLIF(btrim(p_message), ''),
    v_templates[1 + (floor(random() * array_length(v_templates, 1)))::int]);

  -- Insere mensagem com sufixo humanizado informando a quantidade de XP
  -- enviada como presente (sem tags técnicas visíveis para o destinatário).
  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (
    v_conv_id,
    v_me_uid,
    v_text || E'\n\n🎁 Presente enviado: ' || COALESCE(p_amount, 0)::text || ' XP ✨'
  )
  RETURNING id INTO v_msg_id;

  INSERT INTO public.oculto_discovery_gift_log
    (sender_profile_id, target_profile_id, conversation_id, message_id, amount)
  VALUES (v_me_profile, p_target_profile_id, v_conv_id, v_msg_id, COALESCE(p_amount, 0));

  RETURN QUERY SELECT true, 'sent'::text, v_conv_id, v_msg_id;
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_send_gift_autoreply(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_send_gift_autoreply(uuid, integer, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Defaults para Admin Master em system_settings (idempotente)
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value)
VALUES
  ('discovery_actions_enabled', 'true'::jsonb),
  ('discovery_ignore_days', '30'::jsonb),
  ('discovery_approach_enabled', 'true'::jsonb),
  ('discovery_gift_autoreply_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
