-- ============================================================================
-- AURA ROOMS — Privacidade: exibir SOMENTE @username nas salas
--   • aura_room_state: campo `name` passa a ser '@' || username (fallback 'usuario').
--   • aura_room_presence: idem. Schema permanece compatível (mesmas colunas).
--   • aura_room_recent_messages: idem para chat (campos name/username).
-- 100% idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) STATE ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_room_state(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room   public.oculto_aura_rooms;
  v_hour   int := EXTRACT(HOUR FROM now() at time zone 'America/Sao_Paulo')::int;
  v_within boolean := true;
  v_presents jsonb;
  v_dominant uuid;
  v_n_pres int;
  v_n_react int;
  v_energy int;
BEGIN
  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('exists', false); END IF;

  IF v_room.hour_from IS NOT NULL AND v_room.hour_to IS NOT NULL THEN
    IF v_room.hour_from < v_room.hour_to THEN
      v_within := v_hour >= v_room.hour_from AND v_hour < v_room.hour_to;
    ELSE
      v_within := v_hour >= v_room.hour_from OR v_hour < v_room.hour_to;
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id', p.user_id,
    'name', '@' || COALESCE(NULLIF(regexp_replace(p.username, '^@+', ''), ''), 'usuario'),
    'username', COALESCE(NULLIF(regexp_replace(p.username, '^@+', ''), ''), 'usuario'),
    'avatar_url', p.avatar_url,
    'plan_type', p.plan_type,
    'is_observer', pr.is_observer,
    'entered_at', pr.entered_at
  ) ORDER BY pr.entered_at DESC), '[]'::jsonb), count(*)
    INTO v_presents, v_n_pres
    FROM public.oculto_aura_room_presence pr
    JOIN public.profiles p ON p.user_id = pr.user_id
   WHERE pr.room_slug = p_slug
     AND pr.last_ping > now() - interval '3 minutes'
     AND coalesce(p.is_invisible,false) = false
     AND coalesce(p.is_seed,false) = false;

  SELECT count(*) INTO v_n_react
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '60 seconds';

  SELECT to_user INTO v_dominant
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '5 minutes' AND to_user IS NOT NULL
   GROUP BY to_user ORDER BY count(*) DESC LIMIT 1;

  v_energy := LEAST(100, (v_n_pres * 6) + (v_n_react * 4) + v_room.glow_intensity / 4);

  RETURN jsonb_build_object(
    'exists', true,
    'within_window', v_within,
    'presents', v_presents,
    'count', v_n_pres,
    'reactions_60s', v_n_react,
    'dominant_user_id', v_dominant,
    'energy', v_energy,
    'hue', v_room.hue,
    'glow_intensity', v_room.glow_intensity
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_state(text) TO authenticated;

-- 2) PRESENCE ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aura_room_presence(text);
CREATE OR REPLACE FUNCTION public.aura_room_presence(p_slug text)
RETURNS TABLE(user_id uuid, name text, avatar_url text, plan_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.user_id,
    '@' || COALESCE(NULLIF(regexp_replace(p.username, '^@+', ''), ''), 'usuario') AS name,
    p.avatar_url,
    p.plan_type
  FROM public.oculto_aura_room_presence pr
  JOIN public.profiles p ON p.user_id = pr.user_id
  WHERE pr.room_slug = p_slug
    AND pr.last_ping > now() - interval '3 minutes'
    AND coalesce(p.is_invisible,false) = false
    AND coalesce(p.is_seed,false) = false
  ORDER BY pr.entered_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_presence(text) TO authenticated;

-- 3) RECENT MESSAGES (chat) -------------------------------------------------
DROP FUNCTION IF EXISTS public.aura_room_recent_messages(text, int);
CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 80
)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  name         text,
  username     text,
  avatar_url   text,
  plan_type    text,
  is_verified  boolean,
  profile_type text,
  gender       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    m.id, m.user_id, m.body, m.created_at,
    '@' || COALESCE(NULLIF(regexp_replace(p.username, '^@+', ''), ''), 'usuario') AS name,
    COALESCE(NULLIF(regexp_replace(p.username, '^@+', ''), ''), 'usuario')        AS username,
    p.avatar_url, p.plan_type, p.is_verified,
    p.profile_type,
    COALESCE(NULLIF(p.gender, ''), p.profile_type) AS gender
  FROM public.oculto_aura_room_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_slug = p_slug
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 80), 500));
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
