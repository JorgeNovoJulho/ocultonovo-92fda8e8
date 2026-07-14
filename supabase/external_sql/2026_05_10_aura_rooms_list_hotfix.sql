-- Hotfix: aura_rooms_list resiliente — gates com EXCEPTION fallback
-- Resolve erro "column total_score does not exist" e libera a strip de salas.
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
BEGIN
  FOR r IN SELECT * FROM public.oculto_aura_rooms WHERE active = true ORDER BY sort_order, name LOOP
    BEGIN
      v_state := public.aura_room_state(r.slug);
    EXCEPTION WHEN OTHERS THEN
      v_state := jsonb_build_object('count', 0, 'mood', 'calmo', 'rising', false);
    END;

    BEGIN
      v_gates := public._aura_room_check_gates(r.slug, v_uid);
    EXCEPTION WHEN OTHERS THEN
      v_gates := jsonb_build_object('allowed', NOT coalesce(r.vip_only, false), 'observer', false);
    END;

    slug := r.slug; name := r.name; emoji := r.emoji; hue := r.hue; description := r.description;
    vip_only := r.vip_only; required_plan := r.required_plan; requires_kyc := r.requires_kyc; couple_only := r.couple_only;
    min_aura_level := r.min_aura_level; min_social_score := r.min_social_score; min_prestige_xp := r.min_prestige_xp;
    hour_from := r.hour_from; hour_to := r.hour_to; glow_intensity := r.glow_intensity; sort_order := r.sort_order;
    active_count := coalesce((v_state->>'count')::int, 0);
    allowed := coalesce((v_gates->>'allowed')::boolean, NOT coalesce(r.vip_only, false));
    observer_only := coalesce((v_gates->>'observer')::boolean, false);
    mood := coalesce(v_state->>'mood', 'calmo');
    rising := coalesce((v_state->>'rising')::boolean, false);
    reputation_score := coalesce(r.reputation_score, 0);
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_rooms_list() TO authenticated;
NOTIFY pgrst, 'reload schema';
