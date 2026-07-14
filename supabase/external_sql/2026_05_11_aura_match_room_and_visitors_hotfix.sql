-- Hotfix Aura Match: visitantes + salas + chat
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.

-- 1) aura_rooms_rising_now sem ambiguidade de slug ----------------------
CREATE OR REPLACE FUNCTION public.aura_rooms_rising_now()
RETURNS TABLE(slug text, name text, emoji text, hue smallint, energy int, mood text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_state jsonb;
  v_count int;
BEGIN
  FOR r IN
    SELECT rr.slug, rr.name, rr.emoji, rr.hue
      FROM public.oculto_aura_rooms rr
     WHERE rr.active = true
     ORDER BY rr.sort_order, rr.name
  LOOP
    BEGIN
      v_state := public.aura_room_state(r.slug);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*)::int
        INTO v_count
        FROM public.oculto_aura_room_presence pr
       WHERE pr.room_slug = r.slug
         AND pr.last_ping > now() - interval '5 minutes';

      v_state := jsonb_build_object(
        'energy', LEAST(100, GREATEST(0, v_count * 12)),
        'mood', CASE WHEN v_count >= 8 THEN 'elétrica' WHEN v_count >= 4 THEN 'quente' ELSE 'calmo' END,
        'rising', (v_count >= 3)
      );
    END;

    IF COALESCE((v_state->>'rising')::boolean, false) THEN
      slug := r.slug;
      name := r.name;
      emoji := r.emoji;
      hue := r.hue;
      energy := COALESCE((v_state->>'energy')::int, 0);
      mood := COALESCE(v_state->>'mood', 'calmo');
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_rising_now() TO authenticated;

-- 2) aura_rooms_list resiliente sem depender de reputation_score -------
CREATE OR REPLACE FUNCTION public.aura_rooms_list()
RETURNS TABLE(
  slug text, name text, emoji text, hue smallint, description text,
  vip_only boolean, required_plan text, requires_kyc boolean, couple_only boolean,
  min_aura_level smallint, min_social_score int, min_prestige_xp int,
  hour_from smallint, hour_to smallint, glow_intensity smallint, sort_order smallint,
  active_count int, allowed boolean, observer_only boolean,
  mood text, rising boolean, reputation_score int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r record;
  v_state jsonb;
  v_gates jsonb;
  v_count int;
BEGIN
  FOR r IN
    SELECT rr.slug, rr.name, rr.emoji, rr.hue, rr.description,
           rr.vip_only, rr.required_plan, rr.requires_kyc, rr.couple_only,
           rr.min_aura_level, rr.min_social_score, rr.min_prestige_xp,
           rr.hour_from, rr.hour_to, rr.glow_intensity, rr.sort_order
      FROM public.oculto_aura_rooms rr
     WHERE rr.active = true
     ORDER BY rr.sort_order, rr.name
  LOOP
    BEGIN
      v_state := public.aura_room_state(r.slug);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*)::int
        INTO v_count
        FROM public.oculto_aura_room_presence pr
       WHERE pr.room_slug = r.slug
         AND pr.last_ping > now() - interval '5 minutes';

      v_state := jsonb_build_object(
        'count', v_count,
        'mood', CASE WHEN v_count >= 8 THEN 'elétrica' WHEN v_count >= 4 THEN 'quente' ELSE 'calmo' END,
        'rising', (v_count >= 3)
      );
    END;

    BEGIN
      v_gates := public._aura_room_check_gates(r.slug, v_uid);
    EXCEPTION WHEN OTHERS THEN
      v_gates := jsonb_build_object('allowed', NOT COALESCE(r.vip_only, false), 'observer', COALESCE(r.vip_only, false));
    END;

    slug := r.slug;
    name := r.name;
    emoji := r.emoji;
    hue := r.hue;
    description := r.description;
    vip_only := r.vip_only;
    required_plan := r.required_plan;
    requires_kyc := r.requires_kyc;
    couple_only := r.couple_only;
    min_aura_level := r.min_aura_level;
    min_social_score := r.min_social_score;
    min_prestige_xp := r.min_prestige_xp;
    hour_from := r.hour_from;
    hour_to := r.hour_to;
    glow_intensity := r.glow_intensity;
    sort_order := r.sort_order;
    active_count := COALESCE((v_state->>'count')::int, 0);
    allowed := COALESCE((v_gates->>'allowed')::boolean, NOT COALESCE(r.vip_only, false));
    observer_only := COALESCE((v_gates->>'observer')::boolean, COALESCE(r.vip_only, false));
    mood := COALESCE(v_state->>'mood', 'calmo');
    rising := COALESCE((v_state->>'rising')::boolean, false);
    reputation_score := 0;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;

-- 3) Tema Livre sempre aberta + join consistente -----------------------
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS max_capacity smallint NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS open_to_all boolean NOT NULL DEFAULT false;

UPDATE public.oculto_aura_rooms
   SET open_to_all = true,
       max_capacity = GREATEST(COALESCE(max_capacity, 12), 20)
 WHERE slug = 'tema-livre';

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
  IF v_uid IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_auth'); END IF;
  v_master := public._aura_is_master(v_uid);
  v_check := public._aura_room_check_gates(p_slug, v_uid);
  v_obs := NOT COALESCE((v_check->>'allowed')::boolean, false);

  SELECT COALESCE(max_capacity, 12), COALESCE(open_to_all, false)
    INTO v_cap, v_open
    FROM public.oculto_aura_rooms
   WHERE slug = p_slug;

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
       AND enqueued_at <= COALESCE((SELECT enqueued_at FROM public.oculto_aura_room_waitlist WHERE room_slug = p_slug AND user_id = v_uid), now());

    RETURN jsonb_build_object('allowed', false, 'observer', false, 'reason', 'room_full', 'queued', true, 'position', v_pos, 'capacity', v_cap);
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

-- 4) post_message com auto-heal + replies/mentions ---------------------
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
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_recent int;
  v_id uuid;
  v_present boolean;
  v_open boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'auth_required'); END IF;
  IF length(v_body) < 1 OR length(v_body) > 240 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length'); END IF;

  SELECT COALESCE(open_to_all, false) INTO v_open
    FROM public.oculto_aura_rooms WHERE slug = p_slug;

  IF v_open THEN
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug AND user_id = v_uid AND last_ping > now() - interval '10 minutes'
    ) INTO v_present;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.oculto_aura_room_presence
       WHERE room_slug = p_slug AND user_id = v_uid AND is_observer = false AND last_ping > now() - interval '5 minutes'
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
   WHERE room_slug = p_slug AND user_id = v_uid AND created_at > now() - interval '30 seconds';
  IF v_recent >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited'); END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body, reply_to_id, mentions)
  VALUES (p_slug, v_uid, v_body, p_reply_to, COALESCE(p_mentions, '{}'::text[]))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text, uuid, text[]) TO authenticated;

-- 5) histórico de visitantes sem ambiguidade de perfil -----------------
CREATE OR REPLACE FUNCTION public.aura_signal_history(p_signal_kind text, p_limit integer DEFAULT 20)
RETURNS TABLE(
  id text,
  signal_kind text,
  happened_at timestamptz,
  summary text,
  actor_user_id uuid,
  actor_name text,
  actor_username text,
  actor_avatar text,
  locked boolean,
  cost_xp integer,
  seconds_left integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_cost integer := 100;
  v_days integer := 3;
  v_unlock record;
  v_profile_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_cost_xp';
  SELECT COALESCE((value)::int, 3) INTO v_days FROM public.oculto_aura_settings WHERE key = 'aura_signal_history_days';

  SELECT * INTO v_unlock
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid AND u.signal_kind = p_signal_kind AND u.expires_at > now()
   ORDER BY u.expires_at DESC
   LIMIT 1;

  IF p_signal_kind = 'attention' THEN
    RETURN QUERY
    SELECT a.id::text, 'attention'::text, a.created_at, 'Tentaram chamar sua atenção'::text,
           CASE WHEN v_unlock.id IS NOT NULL THEN a.sender_id ELSE NULL::uuid END,
           CASE WHEN v_unlock.id IS NOT NULL THEN COALESCE(p.display_name, p.name, p.username, 'Usuário') ELSE 'Oculto' END,
           CASE WHEN v_unlock.id IS NOT NULL THEN p.username ELSE NULL::text END,
           CASE WHEN v_unlock.id IS NOT NULL THEN p.avatar_url ELSE NULL::text END,
           (v_unlock.id IS NULL), COALESCE(v_cost,100),
           CASE WHEN v_unlock.id IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (v_unlock.expires_at - now()))::int) ELSE 0 END
      FROM public.oculto_aura_attentions a
      LEFT JOIN public.profiles p ON p.user_id = a.sender_id
     WHERE a.target_id = v_uid
       AND a.created_at > now() - make_interval(days => COALESCE(v_days,3))
     ORDER BY a.created_at DESC
     LIMIT v_limit;
    RETURN;
  ELSIF p_signal_kind = 'profile_view' THEN
    SELECT p.id INTO v_profile_id FROM public.profiles p WHERE p.user_id = v_uid LIMIT 1;

    RETURN QUERY
    WITH pv_base AS (
      SELECT pv.id, pv.visited_at, pv.visitor_id
        FROM public.profile_visits pv
       WHERE pv.visited_id = v_profile_id
         AND pv.visited_at > now() - make_interval(days => COALESCE(v_days,3))
       ORDER BY pv.visited_at DESC
       LIMIT v_limit
    ), resolved AS (
      SELECT b.id, b.visited_at, b.visitor_id,
             p.user_id AS resolved_user_id,
             COALESCE(p.display_name, p.name, p.username, 'Usuário') AS resolved_name,
             p.username AS resolved_username,
             p.avatar_url AS resolved_avatar
        FROM pv_base b
        LEFT JOIN public.profiles p ON p.id = b.visitor_id
    )
    SELECT r.id::text, 'profile_view'::text, r.visited_at, 'Alguém olhou seu perfil'::text,
           CASE WHEN v_unlock.id IS NOT NULL THEN r.resolved_user_id ELSE NULL::uuid END,
           CASE WHEN v_unlock.id IS NOT NULL THEN r.resolved_name ELSE 'Oculto' END,
           CASE WHEN v_unlock.id IS NOT NULL THEN r.resolved_username ELSE NULL::text END,
           CASE WHEN v_unlock.id IS NOT NULL THEN r.resolved_avatar ELSE NULL::text END,
           (v_unlock.id IS NULL), COALESCE(v_cost,100),
           CASE WHEN v_unlock.id IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (v_unlock.expires_at - now()))::int) ELSE 0 END
      FROM resolved r
     ORDER BY r.visited_at DESC;
    RETURN;
  ELSE
    RETURN;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_signal_history(text, integer) TO authenticated;

-- 6) realtime garantido -----------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'oculto_aura_room_presence'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_presence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'oculto_aura_room_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'oculto_aura_room_message_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_message_reactions';
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
