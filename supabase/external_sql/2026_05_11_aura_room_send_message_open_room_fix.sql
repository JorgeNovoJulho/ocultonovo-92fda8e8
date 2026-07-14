-- ============================================================
-- Fix: enviar mensagem na sala falha com "not_present" mesmo
-- após o usuário clicar em "Entrar na Sala".
--
-- Causa raiz:
--  1) A sala "Tema Livre" pode não ter `open_to_all = true` no
--     banco, fazendo o gate marcar o usuário como observador
--     (is_observer = true) ao entrar.
--  2) `aura_room_post_message` exige `is_observer = false`,
--     então retorna `not_present` mesmo com presença ativa.
--
-- Solução:
--  A) Garantir `open_to_all = true` em "Tema Livre".
--  B) Defesa em profundidade: em `aura_room_join`, sempre que
--     a sala for `open_to_all`, forçar `is_observer = false`.
--  C) Em `aura_room_post_message`, permitir envio quando a sala
--     for `open_to_all` (independente do flag de observer), pois
--     nessas salas todos podem falar.
--
-- Idempotente — pode rodar quantas vezes quiser.
-- ============================================================

-- A) Marca Tema Livre como aberta a todos
UPDATE public.oculto_aura_rooms
   SET open_to_all = true
 WHERE slug = 'tema-livre';

-- B) aura_room_join: força is_observer=false em salas open_to_all
CREATE OR REPLACE FUNCTION public.aura_room_join(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_check jsonb;
  v_obs boolean;
  v_count int;
  v_cap int;
  v_master boolean;
  v_pos int;
  v_open boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason','no_auth'); END IF;
  v_master := public._aura_is_master(v_uid);
  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT (v_check->>'allowed')::boolean;

  SELECT COALESCE(max_capacity, 12), COALESCE(open_to_all, false)
    INTO v_cap, v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;
  v_cap := COALESCE(v_cap, 12);

  -- Sala aberta a todos: ninguém entra como observador
  IF v_open THEN v_obs := false; END IF;

  -- Master: ignora capacidade e sempre ativo
  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE SET last_ping = now(), is_observer = false;
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'master', true);
  END IF;

  -- Conta presentes ativos (last_ping < 2min) que NÃO são observadores
  SELECT count(*) INTO v_count
    FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug
     AND last_ping > now() - interval '2 minutes'
     AND is_observer = false;

  -- Sala cheia + não observador → entra na waitlist
  IF v_count >= v_cap AND NOT v_obs THEN
    INSERT INTO public.oculto_aura_room_waitlist(room_slug, user_id)
    VALUES (p_slug, v_uid)
    ON CONFLICT (room_slug, user_id) DO NOTHING;

    SELECT count(*) INTO v_pos
      FROM public.oculto_aura_room_waitlist
     WHERE room_slug = p_slug
       AND enqueued_at <= COALESCE(
         (SELECT enqueued_at FROM public.oculto_aura_room_waitlist
            WHERE room_slug = p_slug AND user_id = v_uid),
         now());

    RETURN jsonb_build_object(
      'allowed', false, 'observer', false, 'reason', 'room_full',
      'queued', true, 'position', v_pos, 'capacity', v_cap
    );
  END IF;

  INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
  VALUES (p_slug, v_uid, v_obs, now())
  ON CONFLICT (room_slug, user_id) DO UPDATE
    SET last_ping = now(), is_observer = EXCLUDED.is_observer;

  -- Em salas open_to_all retornamos allowed=true para o frontend
  IF v_open THEN
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'open', true);
  END IF;

  RETURN v_check;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

-- C) aura_room_post_message: aceita observers em salas open_to_all
CREATE OR REPLACE FUNCTION public.aura_room_post_message(
  p_slug text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_recent int;
  v_id     uuid;
  v_present boolean;
  v_open   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF length(v_body) < 1 OR length(v_body) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length');
  END IF;

  SELECT COALESCE(open_to_all, false) INTO v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;

  -- Em salas open_to_all basta ter presença recente (mesmo como observer)
  IF v_open THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug
         AND user_id   = v_uid
         AND last_ping > now() - interval '10 minutes'
    ) INTO v_present;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug
         AND user_id   = v_uid
         AND is_observer = false
         AND last_ping > now() - interval '5 minutes'
    ) INTO v_present;
  END IF;

  -- Auto-recovery: se não há presença ativa, registra agora e segue
  IF NOT v_present THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, NOT v_open, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE
      SET last_ping = now(),
          is_observer = CASE WHEN v_open THEN false ELSE public.oculto_aura_room_presence.is_observer END;

    -- Em salas restritas, ainda exige is_observer=false
    IF NOT v_open THEN
      SELECT EXISTS (
        SELECT 1 FROM public.oculto_aura_room_presence
         WHERE room_slug = p_slug
           AND user_id   = v_uid
           AND is_observer = false
      ) INTO v_present;
      IF NOT v_present THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_present');
      END IF;
    END IF;
  END IF;

  -- Rate limit: 5 mensagens em 30 segundos
  SELECT count(*) INTO v_recent
  FROM public.oculto_aura_room_messages
  WHERE room_slug = p_slug
    AND user_id   = v_uid
    AND created_at > now() - interval '30 seconds';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body)
  VALUES (p_slug, v_uid, v_body)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text) TO authenticated;
