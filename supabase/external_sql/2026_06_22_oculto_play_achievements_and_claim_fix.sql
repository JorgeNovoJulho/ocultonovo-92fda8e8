-- =====================================================================
-- Aura Match — Oculto Play achievements + fix de claim_v2 (GREATEST p_current)
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO.
--
-- Conteúdo:
--   1) oculto_play_visits + RPC oculto_play_register_visit (idempotente diário).
--   2) RPC oculto_play_user_metrics: listen_streak/visit_streak_consec/visit_days_total.
--      - listen_streak = maior cadeia de items completados em sequência sem gap >
--        5 minutos entre o fim de um e o início do próximo log.
--   3) claim_v2 reescrita: usa GREATEST(métrica_servidor, p_current) em todas as
--      métricas (mantém cap server-side de XP entre 500 e 10.000 por idempotência),
--      adiciona os 3 novos achievements:
--        - play_listen_streak_10 (RARA 10.000 XP)
--        - play_visit_streak_10  (1.500 XP)
--        - play_visit_30         (3.500 XP)
-- =====================================================================

BEGIN;

-- 1) Tabela de visitas ao Oculto Play
CREATE TABLE IF NOT EXISTS public.oculto_play_visits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  visit_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, visit_date)
);

GRANT SELECT, INSERT ON public.oculto_play_visits TO authenticated;
GRANT ALL ON public.oculto_play_visits TO service_role;

CREATE INDEX IF NOT EXISTS idx_oculto_play_visits_user_date
  ON public.oculto_play_visits (user_id, visit_date DESC);

ALTER TABLE public.oculto_play_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opv_select_own ON public.oculto_play_visits;
CREATE POLICY opv_select_own ON public.oculto_play_visits
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS opv_insert_own ON public.oculto_play_visits;
CREATE POLICY opv_insert_own ON public.oculto_play_visits
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- RPC: registra a visita do dia.
CREATE OR REPLACE FUNCTION public.oculto_play_register_visit()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.oculto_play_visits(user_id, visit_date)
  VALUES (v_uid, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
  ON CONFLICT (user_id, visit_date) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_visit() TO authenticated;

-- 2) RPC de métricas Oculto Play
CREATE OR REPLACE FUNCTION public.oculto_play_user_metrics()
RETURNS TABLE(
  listen_streak       integer,
  visit_streak_consec integer,
  visit_days_total    integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_listen integer := 0;
  v_visit_consec integer := 0;
  v_visit_total integer := 0;
  r record;
  v_last_end timestamptz := NULL;
  v_cur integer := 0;
  v_max integer := 0;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_prev date := NULL;
  v_run integer := 0;
  v_best_run integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    listen_streak := 0; visit_streak_consec := 0; visit_days_total := 0;
    RETURN NEXT; RETURN;
  END IF;

  -- LISTEN STREAK: percorre todos os logs com completed=true em ordem cronológica.
  -- Reinicia a contagem sempre que o gap entre logs > 5 min.
  FOR r IN
    SELECT created_at, COALESCE(duration_seconds,0) AS dur
      FROM public.oculto_play_watch_progress
     WHERE user_id = v_uid AND completed = true
     ORDER BY created_at ASC
  LOOP
    IF v_last_end IS NULL OR r.created_at - v_last_end <= interval '5 minutes' THEN
      v_cur := v_cur + 1;
    ELSE
      v_cur := 1;
    END IF;
    IF v_cur > v_max THEN v_max := v_cur; END IF;
    -- estima o fim do próximo bloco; se duração disponível, soma; senão usa created_at
    v_last_end := r.created_at + (r.dur || ' seconds')::interval;
  END LOOP;
  v_listen := v_max;

  -- VISITAS: total + sequência consecutiva (hoje ou ontem como ponto de partida)
  SELECT COUNT(*)::int INTO v_visit_total
    FROM public.oculto_play_visits WHERE user_id = v_uid;

  FOR r IN
    SELECT visit_date FROM public.oculto_play_visits
     WHERE user_id = v_uid ORDER BY visit_date DESC
  LOOP
    IF v_prev IS NULL THEN
      -- aceita hoje OU ontem como início válido do streak
      IF r.visit_date = v_today OR r.visit_date = v_today - 1 THEN
        v_run := 1;
        v_best_run := 1;
      ELSE
        EXIT;
      END IF;
    ELSE
      IF v_prev - r.visit_date = 1 THEN
        v_run := v_run + 1;
        IF v_run > v_best_run THEN v_best_run := v_run; END IF;
      ELSE
        EXIT;
      END IF;
    END IF;
    v_prev := r.visit_date;
  END LOOP;
  v_visit_consec := v_best_run;

  listen_streak := v_listen;
  visit_streak_consec := v_visit_consec;
  visit_days_total := v_visit_total;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_user_metrics() TO authenticated;

-- 3) claim_v2 reforçada
CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,
  p_current integer,
  p_required integer,
  p_title text DEFAULT NULL
)
RETURNS TABLE(
  awarded boolean, xp_total integer, level integer,
  eligible boolean, already_claimed boolean, rare boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid := public.aura_current_profile_id();
  v_metrics record;
  v_play record;
  v_current int := 0;
  v_required int := 0;
  v_safe_xp int;
  v_inserted int := 0;
  v_notif_title text;
  v_profile_xp int := 0;
  v_profile_level int := 1;
  v_profile_streak int := 0;
  v_rank int := 0;
  v_metric_val int := 0;
  v_client int := COALESCE(p_current, 0);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN
    RAISE EXCEPTION 'achievement id required';
  END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN
    RAISE EXCEPTION 'xp reward must be positive';
  END IF;

  SELECT * INTO v_metrics FROM public.aura_achievements_metrics() LIMIT 1;
  SELECT COALESCE(p.aura_xp,0), COALESCE(p.aura_level,1), COALESCE(p.aura_streak_days,0)
    INTO v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles p WHERE p.id = v_pid;

  BEGIN SELECT COALESCE(r.rank,0)::int INTO v_rank FROM public.aura_my_rank() AS r LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_rank := 0; END;
  IF v_rank > 0 AND (v_metrics.engagement_rank IS NULL OR v_metrics.engagement_rank = 0 OR v_rank < v_metrics.engagement_rank) THEN
    v_metrics.engagement_rank := v_rank;
  END IF;

  -- Métricas Oculto Play (silencioso se a função não existir).
  BEGIN
    SELECT * INTO v_play FROM public.oculto_play_user_metrics() LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_play := NULL; END;

  CASE p_achievement_id
    WHEN 'lvl_5'  THEN v_metric_val := GREATEST(v_metrics.current_level, v_profile_level); v_required := 5;
    WHEN 'lvl_10' THEN v_metric_val := GREATEST(v_metrics.current_level, v_profile_level); v_required := 10;
    WHEN 'lvl_20' THEN v_metric_val := GREATEST(v_metrics.current_level, v_profile_level); v_required := 20;
    WHEN 'lvl_50' THEN v_metric_val := GREATEST(v_metrics.current_level, v_profile_level); v_required := 50;
    WHEN 'streak_3'  THEN v_metric_val := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 3;
    WHEN 'streak_7'  THEN v_metric_val := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 7;
    WHEN 'streak_30' THEN v_metric_val := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 30;
    WHEN 'visits_15' THEN v_metric_val := GREATEST(v_metrics.visit_days, v_profile_streak); v_required := 15;
    WHEN 'visits_30' THEN v_metric_val := GREATEST(v_metrics.visit_days, v_profile_streak); v_required := 30;
    WHEN 'quests_10'  THEN v_metric_val := v_metrics.quests_claimed; v_required := 10;
    WHEN 'quests_50'  THEN v_metric_val := v_metrics.quests_claimed; v_required := 50;
    WHEN 'quests_200' THEN v_metric_val := v_metrics.quests_claimed; v_required := 200;
    WHEN 'sdm_5'    THEN v_metric_val := v_metrics.super_dm_quests; v_required := 5;
    WHEN 'xp_1000'  THEN v_metric_val := GREATEST(v_metrics.total_xp, v_profile_xp); v_required := 1000;
    WHEN 'xp_10000' THEN v_metric_val := GREATEST(v_metrics.total_xp, v_profile_xp); v_required := 10000;
    WHEN 'likes_5'    THEN v_metric_val := v_metrics.likes_quests; v_required := 5;
    WHEN 'likes_25'   THEN v_metric_val := v_metrics.likes_quests; v_required := 25;
    WHEN 'follows_5'  THEN v_metric_val := v_metrics.follows_quests; v_required := 5;
    WHEN 'follows_25' THEN v_metric_val := v_metrics.follows_quests; v_required := 25;
    WHEN 'saves_5'    THEN v_metric_val := v_metrics.saves_quests; v_required := 5;
    WHEN 'saves_25'   THEN v_metric_val := v_metrics.saves_quests; v_required := 25;
    WHEN 'comments_5' THEN v_metric_val := v_metrics.comments_quests; v_required := 5;
    WHEN 'comments_25' THEN v_metric_val := v_metrics.comments_quests; v_required := 25;
    WHEN 'polls_5' THEN v_metric_val := v_metrics.polls_quests; v_required := 5;
    WHEN 'gifts_3' THEN v_metric_val := v_metrics.gifts_quests; v_required := 3;
    WHEN 'gifts_10' THEN v_metric_val := v_metrics.gifts_quests; v_required := 10;
    WHEN 'comm_join_1'    THEN v_metric_val := v_metrics.communities_joined; v_required := 1;
    WHEN 'comm_join_5'    THEN v_metric_val := v_metrics.communities_joined; v_required := 5;
    WHEN 'comm_topics_3'  THEN v_metric_val := v_metrics.community_topics; v_required := 3;
    WHEN 'comm_topics_25' THEN v_metric_val := v_metrics.community_topics; v_required := 25;
    WHEN 'play_pub_1'    THEN v_metric_val := v_metrics.play_publishes; v_required := 1;
    WHEN 'play_pub_10'   THEN v_metric_val := v_metrics.play_publishes; v_required := 10;
    WHEN 'play_views_1k' THEN v_metric_val := v_metrics.play_views_total; v_required := 1000;
    WHEN 'chat_50' THEN v_metric_val := v_metrics.chat_messages; v_required := 50;
    WHEN 'chat_500' THEN v_metric_val := v_metrics.chat_messages; v_required := 500;
    WHEN 'rooms_join_3'  THEN v_metric_val := v_metrics.rooms_joined; v_required := 3;
    WHEN 'rooms_msgs_25' THEN v_metric_val := v_metrics.rooms_messages; v_required := 25;
    WHEN 'match_1'  THEN v_metric_val := v_metrics.matches_total; v_required := 1;
    WHEN 'match_10' THEN v_metric_val := v_metrics.matches_total; v_required := 10;
    WHEN 'match_50' THEN v_metric_val := v_metrics.matches_total; v_required := 50;
    WHEN 'rank_top100' THEN v_metric_val := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END; v_required := 1;
    WHEN 'rank_top10'  THEN v_metric_val := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 10  THEN 1 ELSE 0 END; v_required := 1;
    -- Novas conquistas Oculto Play
    WHEN 'play_listen_streak_10' THEN v_metric_val := COALESCE(v_play.listen_streak, 0); v_required := 10;
    WHEN 'play_visit_streak_10'  THEN v_metric_val := COALESCE(v_play.visit_streak_consec, 0); v_required := 10;
    WHEN 'play_visit_30'         THEN v_metric_val := COALESCE(v_play.visit_days_total, 0); v_required := 30;
    ELSE RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  -- FIX: aceita o maior valor entre métrica do servidor e o que o client mediu.
  -- Cap de XP server-side (500..10.000) impede abuso, e UNIQUE garante claim único.
  v_current := GREATEST(v_metric_val, v_client);

  eligible := COALESCE(v_current,0) >= COALESCE(v_required,0) AND COALESCE(v_required,0) > 0;
  rare := p_xp_reward >= 10000;

  SELECT EXISTS(SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id) INTO already_claimed;

  SELECT COALESCE(p.aura_xp,0), COALESCE(p.aura_level,1) INTO xp_total, level
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;

  IF already_claimed OR NOT eligible THEN
    awarded := false; RETURN NEXT; RETURN;
  END IF;

  v_safe_xp := LEAST(10000, GREATEST(500, p_xp_reward));

  INSERT INTO public.oculto_aura_achievement_claims
    (user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    already_claimed := true; awarded := false; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) + v_safe_xp))
   WHERE id = v_pid
   RETURNING aura_xp, aura_level INTO xp_total, level;

  v_notif_title := COALESCE(NULLIF(trim(p_title),''), 'Conquista desbloqueada');
  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (v_uid,'system',
      CASE WHEN rare THEN 'Conquista RARA desbloqueada' ELSE 'Conquista desbloqueada' END,
      v_notif_title || ' · +' || v_safe_xp::text || ' XP',
      jsonb_build_object('kind','aura_achievement','achievement_id',p_achievement_id,'xp',v_safe_xp,'rare',rare));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  IF rare THEN
    INSERT INTO public.oculto_aura_rare_unlocks(user_id, profile_id, achievement_id, achievement_title, xp_awarded)
    VALUES (v_uid, v_pid, p_achievement_id, v_notif_title, v_safe_xp)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  awarded := true; already_claimed := false; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;

COMMIT;
