-- =====================================================================
-- Salas em Ascensão · Energia Compartilhada · Reputação da Sala
-- Idempotente. Estende oculto_aura_rooms / aura_room_state.
-- Não cria realtime novo. Não duplica tabelas.
-- =====================================================================

-- 1) Colunas novas em oculto_aura_rooms ------------------------------
ALTER TABLE public.oculto_aura_rooms
  ADD COLUMN IF NOT EXISTS mood              text,
  ADD COLUMN IF NOT EXISTS rising_threshold  smallint NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS reputation_score  integer  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rising_at    timestamptz;

-- 2) aura_room_state: agora retorna rising, mood, bonded_pairs --------
CREATE OR REPLACE FUNCTION public.aura_room_state(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room   public.oculto_aura_rooms;
  v_hour   int := EXTRACT(HOUR FROM now() at time zone 'America/Sao_Paulo')::int;
  v_within boolean := true;
  v_presents jsonb;
  v_dominant uuid;
  v_n_pres int;  v_n_react int;  v_energy int;
  v_n_observe int := 0;  v_n_approach int := 0;  v_n_energy_kind int := 0;
  v_vip int := 0;
  v_vip_ratio numeric := 0;
  v_mood text;
  v_rising boolean := false;
  v_pairs jsonb;
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

  -- presentes (com agregação de VIP)
  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.user_id, 'name', p.name, 'avatar_url', p.avatar_url,
      'plan_type', p.plan_type, 'is_observer', pr.is_observer, 'entered_at', pr.entered_at
    ) ORDER BY pr.entered_at DESC), '[]'::jsonb),
    count(*),
    count(*) FILTER (WHERE lower(coalesce(p.plan_type,'')) LIKE '%vip%')
    INTO v_presents, v_n_pres, v_vip
  FROM public.oculto_aura_room_presence pr
  JOIN public.profiles p ON p.user_id = pr.user_id
  WHERE pr.room_slug = p_slug
    AND pr.last_ping > now() - interval '3 minutes'
    AND coalesce(p.is_invisible,false) = false
    AND coalesce(p.is_seed,false) = false;

  IF v_n_pres > 0 THEN v_vip_ratio := v_vip::numeric / v_n_pres::numeric; END IF;

  -- reações últimos 60s + breakdown por tipo
  SELECT count(*),
         count(*) FILTER (WHERE kind = 'observe'),
         count(*) FILTER (WHERE kind = 'approach'),
         count(*) FILTER (WHERE kind = 'energy')
    INTO v_n_react, v_n_observe, v_n_approach, v_n_energy_kind
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '60 seconds';

  SELECT to_user INTO v_dominant
    FROM public.oculto_aura_room_reactions
   WHERE room_slug = p_slug AND created_at > now() - interval '5 minutes' AND to_user IS NOT NULL
   GROUP BY to_user ORDER BY count(*) DESC LIMIT 1;

  v_energy := LEAST(100, (v_n_pres * 6) + (v_n_react * 4) + v_room.glow_intensity / 4);

  -- mood derivado dinamicamente (override manual via oculto_aura_rooms.mood)
  IF v_room.mood IS NOT NULL AND length(v_room.mood) > 0 THEN
    v_mood := v_room.mood;
  ELSIF v_vip_ratio > 0.4 THEN
    v_mood := 'elite';
  ELSIF v_n_observe > greatest(v_n_energy_kind, v_n_approach) THEN
    v_mood := 'misterioso';
  ELSIF v_n_approach > greatest(v_n_observe, v_n_energy_kind) THEN
    v_mood := 'fervendo';
  ELSIF v_energy > 60 THEN
    v_mood := 'popular';
  ELSE
    v_mood := 'calmo';
  END IF;

  -- ascensão (energia ≥ threshold + reações ≥ 8/min)
  v_rising := v_energy >= v_room.rising_threshold AND v_n_react >= 8;

  -- pares vinculados: ≥ 3 reações cruzadas em 5 min (bidirecionais)
  WITH r AS (
    SELECT from_user, to_user
      FROM public.oculto_aura_room_reactions
     WHERE room_slug = p_slug
       AND created_at > now() - interval '5 minutes'
       AND to_user IS NOT NULL
  ), pairs AS (
    SELECT
      LEAST(from_user, to_user) AS a,
      GREATEST(from_user, to_user) AS b,
      count(*) AS n
    FROM r
    GROUP BY 1, 2
    HAVING count(*) >= 3
    LIMIT 8
  )
  SELECT coalesce(jsonb_agg(jsonb_build_array(a, b)), '[]'::jsonb)
    INTO v_pairs FROM pairs;

  RETURN jsonb_build_object(
    'exists', true, 'within_window', v_within, 'presents', v_presents,
    'count', v_n_pres, 'reactions_60s', v_n_react, 'dominant_user_id', v_dominant,
    'energy', v_energy, 'hue', v_room.hue, 'glow_intensity', v_room.glow_intensity,
    'mood', v_mood, 'rising', v_rising, 'bonded_pairs', v_pairs,
    'reputation_score', v_room.reputation_score
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_state(text) TO authenticated;

-- 3) Recalc de reputação (chamado pelo purge) -------------------------
CREATE OR REPLACE FUNCTION public.aura_room_reputation_recalc()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT slug, reputation_score FROM public.oculto_aura_rooms WHERE active = true LOOP
    DECLARE
      v_react int := 0; v_pairs int := 0; v_vip int := 0; v_decay int := 0; v_new int := 0;
    BEGIN
      SELECT count(*) INTO v_react FROM public.oculto_aura_room_reactions
       WHERE room_slug = r.slug AND created_at > now() - interval '10 minutes';

      WITH r2 AS (
        SELECT LEAST(from_user, to_user) AS a, GREATEST(from_user, to_user) AS b, count(*) AS n
          FROM public.oculto_aura_room_reactions
         WHERE room_slug = r.slug AND created_at > now() - interval '10 minutes'
           AND to_user IS NOT NULL
         GROUP BY 1, 2 HAVING count(*) >= 3
      ) SELECT count(*) INTO v_pairs FROM r2;

      SELECT count(*) INTO v_vip
        FROM public.oculto_aura_room_presence pr
        JOIN public.profiles p ON p.user_id = pr.user_id
       WHERE pr.room_slug = r.slug AND pr.last_ping > now() - interval '3 minutes'
         AND lower(coalesce(p.plan_type,'')) LIKE '%vip%';

      v_decay := (r.reputation_score * 5) / 100;  -- 5%
      v_new := GREATEST(0, LEAST(1000, r.reputation_score - v_decay + v_react + v_pairs * 3 + v_vip * 5));

      UPDATE public.oculto_aura_rooms
         SET reputation_score = v_new,
             last_rising_at = CASE
               WHEN (SELECT (public.aura_room_state(r.slug)->>'rising')::boolean) THEN now()
               ELSE last_rising_at END
       WHERE slug = r.slug;
    END;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_reputation_recalc() TO authenticated;

-- 4) aura_rooms_purge agora também recalcula reputação ----------------
CREATE OR REPLACE FUNCTION public.aura_rooms_purge()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.oculto_aura_room_presence  WHERE last_ping  < now() - interval '5 minutes';
  DELETE FROM public.oculto_aura_room_reactions WHERE created_at < now() - interval '10 minutes';
  PERFORM public.aura_room_reputation_recalc();
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_purge() TO authenticated;

-- 5) RPC pública: até 3 salas em ascensão agora -----------------------
CREATE OR REPLACE FUNCTION public.aura_rooms_rising_now()
RETURNS TABLE(slug text, name text, emoji text, hue smallint, energy int, mood text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_state jsonb;
BEGIN
  FOR r IN SELECT * FROM public.oculto_aura_rooms WHERE active = true LOOP
    v_state := public.aura_room_state(r.slug);
    IF coalesce((v_state->>'rising')::boolean, false) THEN
      slug := r.slug; name := r.name; emoji := r.emoji; hue := r.hue;
      energy := coalesce((v_state->>'energy')::int, 0);
      mood := v_state->>'mood';
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_rising_now() TO authenticated;

-- 6) RPC admin: métricas agregadas ------------------------------------
CREATE OR REPLACE FUNCTION public.aura_rooms_metrics_admin()
RETURNS TABLE(
  slug text, name text, emoji text, energy int, mood text, rising boolean,
  presence int, reactions_60s int, reputation int, rising_threshold int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_state jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND lower(coalesce(username,'')) = 'ocultomaster') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT * FROM public.oculto_aura_rooms ORDER BY sort_order, name LOOP
    v_state := public.aura_room_state(r.slug);
    slug := r.slug; name := r.name; emoji := r.emoji;
    energy := coalesce((v_state->>'energy')::int, 0);
    mood := v_state->>'mood';
    rising := coalesce((v_state->>'rising')::boolean, false);
    presence := coalesce((v_state->>'count')::int, 0);
    reactions_60s := coalesce((v_state->>'reactions_60s')::int, 0);
    reputation := r.reputation_score;
    rising_threshold := r.rising_threshold;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_metrics_admin() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 7) aura_rooms_list reescrita: inclui mood + rising ------------------
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
DECLARE v_uid uuid := auth.uid(); r record; v_state jsonb; v_gates jsonb;
BEGIN
  FOR r IN SELECT * FROM public.oculto_aura_rooms WHERE active = true ORDER BY sort_order, name LOOP
    v_state := public.aura_room_state(r.slug);
    v_gates := public._aura_room_check_gates(r.slug, v_uid);
    slug := r.slug; name := r.name; emoji := r.emoji; hue := r.hue; description := r.description;
    vip_only := r.vip_only; required_plan := r.required_plan; requires_kyc := r.requires_kyc; couple_only := r.couple_only;
    min_aura_level := r.min_aura_level; min_social_score := r.min_social_score; min_prestige_xp := r.min_prestige_xp;
    hour_from := r.hour_from; hour_to := r.hour_to; glow_intensity := r.glow_intensity; sort_order := r.sort_order;
    active_count := coalesce((v_state->>'count')::int, 0);
    allowed := coalesce((v_gates->>'allowed')::boolean, false);
    observer_only := coalesce((v_gates->>'observer')::boolean, true);
    mood := v_state->>'mood';
    rising := coalesce((v_state->>'rising')::boolean, false);
    reputation_score := r.reputation_score;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;

NOTIFY pgrst, 'reload schema';
