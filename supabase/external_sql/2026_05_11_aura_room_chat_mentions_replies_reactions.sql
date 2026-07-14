-- ============================================================
-- AURA ROOM CHAT V2
--   * Garante colunas open_to_all / max_capacity em oculto_aura_rooms
--   * Marca Tema Livre como aberta a todos
--   * Salas open_to_all não bloqueiam observadores no envio
--   * Adiciona reply_to_id e mentions[] nas mensagens
--   * Tabela de reações (like/dislike) por mensagem
--   * RPCs: post_message com reply/mentions, react_message,
--     recent_messages com counts e reply context
-- Idempotente — pode rodar múltiplas vezes.
-- ============================================================

-- 0) Garante colunas mínimas no rooms ----------------------------------
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS max_capacity smallint NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS open_to_all  boolean  NOT NULL DEFAULT false;

UPDATE public.oculto_aura_rooms
   SET open_to_all = true,
       max_capacity = GREATEST(COALESCE(max_capacity, 12), 20)
 WHERE slug = 'tema-livre';

-- 1) Mensagens: reply_to_id + mentions[] -------------------------------
ALTER TABLE public.oculto_aura_room_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid NULL
    REFERENCES public.oculto_aura_room_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mentions text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_aura_room_messages_reply
  ON public.oculto_aura_room_messages(reply_to_id);

-- 2) Tabela de reações --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_message_reactions (
  message_id uuid NOT NULL REFERENCES public.oculto_aura_room_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('like','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
ALTER TABLE public.oculto_aura_room_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "react read" ON public.oculto_aura_room_message_reactions;
CREATE POLICY "react read" ON public.oculto_aura_room_message_reactions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "react write own" ON public.oculto_aura_room_message_reactions;
CREATE POLICY "react write own" ON public.oculto_aura_room_message_reactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_aura_room_react_msg
  ON public.oculto_aura_room_message_reactions(message_id);

-- 3) JOIN: força observer=false em open_to_all -------------------------
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

  IF v_open THEN v_obs := false; END IF;

  IF v_master THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, false, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE SET last_ping = now(), is_observer = false;
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'master', true);
  END IF;

  SELECT count(*) INTO v_count
    FROM public.oculto_aura_room_presence
   WHERE room_slug = p_slug
     AND last_ping > now() - interval '2 minutes'
     AND is_observer = false;

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

  IF v_open THEN
    RETURN jsonb_build_object('allowed', true, 'observer', false, 'reason', null, 'open', true);
  END IF;

  RETURN v_check;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_join(text) TO authenticated;

-- 4) POST MESSAGE V2: aceita reply_to + mentions + auto-heal -----------
DROP FUNCTION IF EXISTS public.aura_room_post_message(text, text);
DROP FUNCTION IF EXISTS public.aura_room_post_message(text, text, uuid, text[]);

CREATE OR REPLACE FUNCTION public.aura_room_post_message(
  p_slug text,
  p_body text,
  p_reply_to uuid DEFAULT NULL,
  p_mentions text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_recent int;
  v_id     uuid;
  v_present boolean;
  v_open   boolean;
  v_mentions text[] := COALESCE(p_mentions, '{}'::text[]);
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  IF length(v_body) < 1 OR length(v_body) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length');
  END IF;

  SELECT COALESCE(open_to_all, false) INTO v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;

  IF v_open THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug AND user_id = v_uid
         AND last_ping > now() - interval '10 minutes'
    ) INTO v_present;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug AND user_id = v_uid
         AND is_observer = false
         AND last_ping > now() - interval '5 minutes'
    ) INTO v_present;
  END IF;

  IF NOT v_present THEN
    INSERT INTO public.oculto_aura_room_presence(room_slug, user_id, is_observer, last_ping)
    VALUES (p_slug, v_uid, NOT v_open, now())
    ON CONFLICT (room_slug, user_id) DO UPDATE
      SET last_ping = now(),
          is_observer = CASE WHEN v_open THEN false ELSE public.oculto_aura_room_presence.is_observer END;

    IF NOT v_open THEN
      SELECT EXISTS (
        SELECT 1 FROM public.oculto_aura_room_presence
         WHERE room_slug = p_slug AND user_id = v_uid AND is_observer = false
      ) INTO v_present;
      IF NOT v_present THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_present'); END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_recent
    FROM public.oculto_aura_room_messages
   WHERE room_slug = p_slug AND user_id = v_uid
     AND created_at > now() - interval '30 seconds';
  IF v_recent >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body, reply_to_id, mentions)
  VALUES (p_slug, v_uid, v_body, p_reply_to, v_mentions)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text, uuid, text[]) TO authenticated;

-- 5) REACT MESSAGE: like / dislike (toggle) ----------------------------
CREATE OR REPLACE FUNCTION public.aura_room_react_message(
  p_message_id uuid,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason','auth_required'); END IF;
  IF p_kind NOT IN ('like','dislike') THEN
    RETURN jsonb_build_object('ok', false, 'reason','invalid_kind');
  END IF;

  SELECT kind INTO v_existing
    FROM public.oculto_aura_room_message_reactions
   WHERE message_id = p_message_id AND user_id = v_uid;

  IF v_existing IS NULL THEN
    INSERT INTO public.oculto_aura_room_message_reactions(message_id, user_id, kind)
    VALUES (p_message_id, v_uid, p_kind);
    RETURN jsonb_build_object('ok', true, 'state','added','kind', p_kind);
  ELSIF v_existing = p_kind THEN
    DELETE FROM public.oculto_aura_room_message_reactions
     WHERE message_id = p_message_id AND user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'state','removed');
  ELSE
    UPDATE public.oculto_aura_room_message_reactions
       SET kind = p_kind, created_at = now()
     WHERE message_id = p_message_id AND user_id = v_uid;
    RETURN jsonb_build_object('ok', true, 'state','switched','kind', p_kind);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_react_message(uuid, text) TO authenticated;

-- 6) RECENT MESSAGES V3: inclui reply_to + counts + my_reaction + mentions
DROP FUNCTION IF EXISTS public.aura_room_recent_messages(text, int);

CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  id              uuid,
  user_id         uuid,
  body            text,
  created_at      timestamptz,
  name            text,
  username        text,
  avatar_url      text,
  plan_type       text,
  is_verified     boolean,
  profile_type    text,
  gender          text,
  mentions        text[],
  reply_to_id     uuid,
  reply_to_body   text,
  reply_to_user   text,
  like_count      int,
  dislike_count   int,
  my_reaction     text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT m.*
      FROM public.oculto_aura_room_messages m
     WHERE m.room_slug = p_slug
       AND m.created_at > now() - interval '6 hours'
     ORDER BY m.created_at DESC
     LIMIT greatest(1, least(coalesce(p_limit, 40), 80))
  )
  SELECT
    b.id, b.user_id, b.body, b.created_at,
    p.name, p.username, p.avatar_url, p.plan_type, p.is_verified,
    p.profile_type,
    COALESCE(NULLIF(p.gender, ''), p.profile_type) AS gender,
    COALESCE(b.mentions, '{}'::text[]) AS mentions,
    b.reply_to_id,
    rm.body AS reply_to_body,
    COALESCE(rp.username, rp.name) AS reply_to_user,
    COALESCE((SELECT count(*)::int FROM public.oculto_aura_room_message_reactions r
               WHERE r.message_id = b.id AND r.kind = 'like'), 0) AS like_count,
    COALESCE((SELECT count(*)::int FROM public.oculto_aura_room_message_reactions r
               WHERE r.message_id = b.id AND r.kind = 'dislike'), 0) AS dislike_count,
    (SELECT r.kind FROM public.oculto_aura_room_message_reactions r
      WHERE r.message_id = b.id AND r.user_id = auth.uid()) AS my_reaction
  FROM base b
  LEFT JOIN public.profiles p ON p.user_id = b.user_id
  LEFT JOIN public.oculto_aura_room_messages rm ON rm.id = b.reply_to_id
  LEFT JOIN public.profiles rp ON rp.user_id = rm.user_id
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

-- 7) Realtime para reações (opcional — útil se quiser INSERT live)
ALTER TABLE public.oculto_aura_room_message_reactions REPLICA IDENTITY FULL;
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='oculto_aura_room_message_reactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_message_reactions';
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
