-- =============================================================================
-- Hotfix: aura_room_post_message não falhar para Master nem para usuários que
-- já cumprem os requisitos da sala mas estão registrados como is_observer=true.
--
-- Sintoma observado (caso ocultomaster em "Energia VIP"):
--   • Usuário entrou e enviou mensagens → algumas voltaram com FALHOU/enviando.
--   • RPC `aura_room_post_message` retornava {ok:false, reason:'not_present'}
--     porque o auto-heal preservava is_observer=true em salas restritas.
--
-- Correções idempotentes:
--   1) Master (_aura_is_master) sempre passa.
--   2) Em salas restritas, se o usuário PASSA nos gates (_aura_room_check_gates
--      retorna allowed=true), forçamos is_observer=false antes de enviar.
--   3) Mantém todas as proteções para observers reais (não-allowed).
--
-- Reidempotente: pode rodar várias vezes sem efeitos colaterais.
-- =============================================================================

DROP FUNCTION IF EXISTS public.aura_room_post_message(text, text);
DROP FUNCTION IF EXISTS public.aura_room_post_message(text, text, uuid, text[]);

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
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF length(v_body) < 1 OR length(v_body) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length');
  END IF;

  SELECT COALESCE(open_to_all, false) INTO v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;

  v_master := public._aura_is_master(v_uid);

  -- Master sempre tem presença ativa garantida.
  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE
      SET last_ping = now(), is_observer = false;
  ELSE
    -- Avalia se este usuário cumpre os requisitos desta sala.
    v_gates   := public._aura_room_check_gates(p_slug, v_uid);
    v_allowed := COALESCE((v_gates->>'allowed')::boolean, false);

    IF v_open OR v_allowed THEN
      -- Garante presença ATIVA (não-observer) para quem pode falar.
      INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
      VALUES (p_slug, v_uid, false, now())
      ON CONFLICT (room_slug, user_id) DO UPDATE
        SET last_ping = now(), is_observer = false;
    ELSE
      -- Usuário não cumpre requisitos: não pode enviar mensagens.
      RETURN jsonb_build_object('ok', false, 'reason', 'observer_only');
    END IF;
  END IF;

  -- Confirmação final de presença (defesa em profundidade).
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_aura_room_presence
     WHERE room_slug = p_slug
       AND user_id   = v_uid
       AND is_observer = false
       AND last_ping > now() - interval '10 minutes'
  ) INTO v_present;

  IF NOT v_present THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_present');
  END IF;

  -- Rate limit: 5 mensagens / 30s
  SELECT count(*) INTO v_recent
    FROM public.oculto_aura_room_messages
   WHERE room_slug = p_slug
     AND user_id   = v_uid
     AND created_at > now() - interval '30 seconds';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body, reply_to_id, mentions)
  VALUES (p_slug, v_uid, v_body, p_reply_to, v_mentions)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text, uuid, text[]) TO authenticated;
