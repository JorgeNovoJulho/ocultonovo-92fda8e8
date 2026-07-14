-- =============================================================
-- HOTFIX 2026-05-22
-- 1) Gate de salas Aura: ler Score Social / Aura / Prestígio das
--    fontes canônicas (mesmas usadas pelo frontend).
-- 2) Missões diárias: avançar retention_day automaticamente quando
--    o usuário resgata TODAS as missões ativas do dia atual.
-- Idempotente — pode rodar várias vezes.
-- =============================================================

-- -------------------------------------------------------------
-- 1) GATE: sincroniza com as fontes oficiais
--    - Aura level:        profiles.aura_level (mesma fonte do aura_get_progress)
--    - Social score (XP): oculto_social_scores.total_xp
--    - Prestige XP:       social_prestige_get(uid)->>'xp'  (fallback profiles.prestige_xp)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._aura_room_check_gates(p_slug text, p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room        record;
  v_plan        text;
  v_is_verified boolean;
  v_aura_level  int := 0;
  v_social_xp   int := 0;
  v_prestige_xp int := 0;
  v_reasons     text[] := '{}';
  v_jsonb       jsonb;
BEGIN
  IF public._aura_is_master(p_uid) THEN
    RETURN jsonb_build_object('allowed', true, 'master', true, 'reasons', '[]'::jsonb);
  END IF;

  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reasons', jsonb_build_array('room_not_found'));
  END IF;
  IF COALESCE(v_room.open_to_all, false) THEN
    RETURN jsonb_build_object('allowed', true, 'reasons', '[]'::jsonb);
  END IF;

  -- Plano + verificação ainda vêm de profiles
  SELECT plan_type, COALESCE(is_verified,false),
         COALESCE(aura_level,0), COALESCE(prestige_xp,0)
    INTO v_plan, v_is_verified, v_aura_level, v_prestige_xp
    FROM public.profiles WHERE user_id = p_uid;

  -- Social Score canônico (oculto_social_scores.total_xp)
  BEGIN
    SELECT COALESCE(total_xp, 0) INTO v_social_xp
      FROM public.oculto_social_scores WHERE user_id = p_uid;
  EXCEPTION WHEN OTHERS THEN
    v_social_xp := 0;
  END;
  v_social_xp := COALESCE(v_social_xp, 0);

  -- Prestige canônico via RPC (best-effort); fallback no profiles.prestige_xp
  BEGIN
    v_jsonb := public.social_prestige_get(p_uid);
    IF v_jsonb IS NOT NULL THEN
      v_prestige_xp := GREATEST(
        v_prestige_xp,
        COALESCE( (v_jsonb->>'xp')::int,
                  (v_jsonb->>'total_xp')::int,
                  0 )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- mantém valor de profiles
    NULL;
  END;

  IF COALESCE(v_room.vip_only, false)
     AND lower(COALESCE(v_plan,'free')) NOT IN ('vip','premium','vip_plus') THEN
    v_reasons := v_reasons || 'vip_required';
  END IF;
  IF COALESCE(v_room.requires_kyc, false) AND v_is_verified = false THEN
    v_reasons := v_reasons || 'kyc_required';
  END IF;
  IF COALESCE(v_room.min_aura_level,0) > v_aura_level THEN
    v_reasons := v_reasons || 'aura_level';
  END IF;
  IF COALESCE(v_room.min_social_score,0) > v_social_xp THEN
    v_reasons := v_reasons || 'social_score';
  END IF;
  IF COALESCE(v_room.min_prestige_xp,0) > v_prestige_xp THEN
    v_reasons := v_reasons || 'prestige_xp';
  END IF;

  RETURN jsonb_build_object(
    'allowed', array_length(v_reasons,1) IS NULL,
    'reasons', to_jsonb(v_reasons),
    'have', jsonb_build_object(
      'aura_level', v_aura_level,
      'social_score', v_social_xp,
      'prestige_xp', v_prestige_xp,
      'plan', COALESCE(v_plan,'free'),
      'verified', v_is_verified
    )
  );
END; $$;
GRANT EXECUTE ON FUNCTION public._aura_room_check_gates(text, uuid) TO authenticated;

-- -------------------------------------------------------------
-- 2) retention_touch: além do bump por calendário, AVANÇA o dia
--    automaticamente quando todas as missões ativas do dia atual
--    já foram resgatadas (claimed). Reinicia o conjunto resgatado
--    a cada novo dia para manter consistência.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_touch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_day           int;
  v_calendar_day  int;
  v_total_today   int;
  v_claimed_today int;
  v_claimed       jsonb;
  v_first_seen    timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.oculto_retention_progress (user_id, last_active_at, retention_day, updated_at)
  VALUES (v_uid, now(), 1, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(retention_day,1),
         COALESCE(claimed_missions,'[]'::jsonb),
         first_seen_at
    INTO v_day, v_claimed, v_first_seen
    FROM public.oculto_retention_progress
   WHERE user_id = v_uid;

  v_day := COALESCE(v_day, 1);
  v_first_seen := COALESCE(v_first_seen, now());

  -- Calendário: dias inteiros decorridos desde o first_seen_at
  v_calendar_day := LEAST(
    7,
    GREATEST(
      1,
      FLOOR(EXTRACT(EPOCH FROM (now() - v_first_seen)) / 86400.0)::int + 1
    )
  );

  -- Quantas missões ativas existem no dia atual e quantas o usuário já resgatou
  SELECT count(*) INTO v_total_today
    FROM public.oculto_retention_missions_config
   WHERE active = true AND day = v_day;

  SELECT count(*) INTO v_claimed_today
    FROM public.oculto_retention_missions_config m
   WHERE m.active = true AND m.day = v_day
     AND v_claimed ? m.key;

  -- Se todas as missões do dia foram resgatadas e ainda não chegou ao dia 7,
  -- avança imediatamente para o próximo dia (catch-up auto).
  IF v_total_today > 0 AND v_claimed_today >= v_total_today AND v_day < 7 THEN
    v_day := v_day + 1;
  END IF;

  -- Pega o maior entre calendário e auto-advance
  v_day := LEAST(7, GREATEST(v_day, v_calendar_day));

  UPDATE public.oculto_retention_progress
     SET retention_day  = v_day,
         last_active_at = now(),
         updated_at     = now()
   WHERE user_id = v_uid;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_touch() TO authenticated;

-- -------------------------------------------------------------
-- 3) retention_mission_claim_xp: após resgatar, chama retention_touch
--    para já refletir o avanço do dia na próxima leitura (sem F5).
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_mission_claim_xp(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_xp       int;
  v_done     jsonb;
  v_claimed  jsonb;
  v_user_day int;
  v_mult     int := 1;
  v_awarded  int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT xp_reward INTO v_xp
    FROM public.oculto_retention_missions_config
   WHERE key = p_key AND active = true;
  IF v_xp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  INSERT INTO public.oculto_retention_progress (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(completed_missions,'[]'::jsonb),
         COALESCE(claimed_missions,'[]'::jsonb),
         COALESCE(retention_day,1)
    INTO v_done, v_claimed, v_user_day
    FROM public.oculto_retention_progress WHERE user_id = v_uid;

  IF NOT (v_done ? p_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completed');
  END IF;
  IF v_claimed ? p_key THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true);
  END IF;

  IF COALESCE(v_user_day, 1) >= 7 THEN v_mult := 2; END IF;
  v_awarded := v_xp * v_mult;

  UPDATE public.oculto_retention_progress
     SET claimed_missions = v_claimed || to_jsonb(p_key),
         last_active_at   = now(),
         updated_at       = now()
   WHERE user_id = v_uid;

  BEGIN
    PERFORM public.aura_award_xp(v_awarded, 'retention_mission_claim:' || p_key);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Avança automaticamente o dia se todas as missões do dia foram resgatadas
  BEGIN PERFORM public.retention_touch(); EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'xp_awarded', v_awarded, 'multiplier', v_mult);
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_claim_xp(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
