-- =====================================================================
-- Aura Match — Fix de rising RPC + fallback estável de salas + realtime
-- Idempotente. Cole inteiro no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) aura_rooms_rising_now resiliente ----------------------------------
CREATE OR REPLACE FUNCTION public.aura_rooms_rising_now()
RETURNS TABLE(slug text, name text, emoji text, hue smallint, energy int, mood text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  v_state jsonb;
  v_count int;
BEGIN
  FOR r IN
    SELECT slug, name, emoji, hue
      FROM public.oculto_aura_rooms
     WHERE active = true
     ORDER BY sort_order, name
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

-- 2) aura_rooms_list resiliente ----------------------------------------
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
    SELECT *
      FROM public.oculto_aura_rooms
     WHERE active = true
     ORDER BY sort_order, name
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
      v_gates := jsonb_build_object(
        'allowed', NOT COALESCE(r.vip_only, false),
        'observer', COALESCE(r.vip_only, false)
      );
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
    reputation_score := COALESCE(r.reputation_score, 0);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;

-- 3) Garantia de realtime nas tabelas efêmeras -------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  PERFORM 1
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'oculto_aura_room_presence';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_presence';
  END IF;

  PERFORM 1
    FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime'
     AND schemaname = 'public'
     AND tablename = 'oculto_aura_room_reactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_reactions';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';