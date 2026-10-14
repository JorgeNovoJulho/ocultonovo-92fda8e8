-- ============================================================
-- Aura Match · Conquistas: XP de cada conquista decidido pelo SERVIDOR.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO
-- (depois de 2026_10_14_aura_achievements_visit_days_fix.sql).
--
-- Antes: o app enviava quanto XP a conquista valia (p_xp_reward) e o
-- servidor só limitava entre 500 e 50.000 — dava para pedir 50.000 XP em
-- qualquer conquista cumprida. Agora o valor vem da tabela abaixo.
-- Também alinha "Sol Interior" (xp_10000) ao texto do card: 150.000 XP.
-- Assinatura inalterada: o app atual continua funcionando.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,
  p_current integer,
  p_required integer,
  p_title text DEFAULT NULL
)
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  already_claimed boolean,
  rare boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid := public.aura_current_profile_id();
  v_metrics record;
  v_current integer := 0;
  v_required integer := 0;
  v_safe_xp integer := 0;
  v_inserted integer := 0;
  v_notif_title text;
  v_profile_xp integer := 0;
  v_profile_level integer := 1;
  v_profile_streak integer := 0;
  v_profile_user_id uuid;
  v_distinct_days integer := 0;
  v_has_engagement boolean := to_regclass('public.engagement_events') IS NOT NULL;
  v_has_xp_tx boolean := to_regclass('public.xp_transactions') IS NOT NULL;
  v_rare_ids text[] := ARRAY['play_views_1k','match_50','play_listen_streak_10','play_movie_15','xp_10000'];
  v_total_non_meta integer := 48;
  v_claimed_rares integer := 0;
  v_claimed_total integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  SELECT * INTO v_metrics FROM public.aura_achievements_metrics() LIMIT 1;

  SELECT COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1), COALESCE(p.aura_streak_days, 0), p.user_id
  INTO v_profile_xp, v_profile_level, v_profile_streak, v_profile_user_id
  FROM public.profiles p
  WHERE p.id = v_pid;

  -- visits_15/visits_30: a contagem de dias agora é robusta dentro de
  -- aura_achievements_metrics() (cada tabela em bloco próprio).

  IF p_achievement_id IN ('meta_all_rares','meta_all') THEN
    SELECT
      COUNT(*) FILTER (WHERE achievement_id = ANY(v_rare_ids)),
      COUNT(*) FILTER (WHERE NOT (achievement_id LIKE 'meta\_%' ESCAPE '\'))
    INTO v_claimed_rares, v_claimed_total
    FROM public.oculto_aura_achievement_claims
    WHERE user_id = v_uid;
  END IF;

  CASE p_achievement_id
    WHEN 'lvl_5' THEN v_current := GREATEST(v_metrics.current_level, v_profile_level); v_required := 5;
    WHEN 'lvl_10' THEN v_current := GREATEST(v_metrics.current_level, v_profile_level); v_required := 10;
    WHEN 'lvl_20' THEN v_current := GREATEST(v_metrics.current_level, v_profile_level); v_required := 20;
    WHEN 'lvl_50' THEN v_current := GREATEST(v_metrics.current_level, v_profile_level); v_required := 50;
    WHEN 'streak_3' THEN v_current := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 3;
    WHEN 'streak_7' THEN v_current := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 7;
    WHEN 'streak_30' THEN v_current := GREATEST(v_metrics.current_streak, v_profile_streak); v_required := 30;
    WHEN 'visits_15' THEN v_current := GREATEST(v_metrics.visit_days, v_profile_streak); v_required := 15;
    WHEN 'visits_30' THEN v_current := GREATEST(v_metrics.visit_days, v_profile_streak); v_required := 30;
    WHEN 'quests_10' THEN v_current := v_metrics.quests_claimed; v_required := 10;
    WHEN 'quests_50' THEN v_current := v_metrics.quests_claimed; v_required := 50;
    WHEN 'quests_200' THEN v_current := v_metrics.quests_claimed; v_required := 200;
    WHEN 'sdm_5' THEN v_current := v_metrics.super_dm_quests; v_required := 5;
    WHEN 'xp_1000' THEN v_current := GREATEST(v_metrics.total_xp, v_profile_xp); v_required := 1000;
    WHEN 'xp_10000' THEN v_current := GREATEST(v_metrics.total_xp, v_profile_xp); v_required := 150000;
    WHEN 'likes_5' THEN v_current := v_metrics.likes_quests; v_required := 5;
    WHEN 'likes_25' THEN v_current := v_metrics.likes_quests; v_required := 25;
    WHEN 'follows_5' THEN v_current := v_metrics.follows_quests; v_required := 5;
    WHEN 'follows_25' THEN v_current := v_metrics.follows_quests; v_required := 25;
    WHEN 'saves_5' THEN v_current := v_metrics.saves_quests; v_required := 5;
    WHEN 'saves_25' THEN v_current := v_metrics.saves_quests; v_required := 25;
    WHEN 'comments_5' THEN v_current := v_metrics.comments_quests; v_required := 5;
    WHEN 'comments_25' THEN v_current := v_metrics.comments_quests; v_required := 25;
    WHEN 'polls_5' THEN v_current := v_metrics.polls_quests; v_required := 5;
    WHEN 'gifts_3' THEN v_current := v_metrics.gifts_quests; v_required := 3;
    WHEN 'gifts_10' THEN v_current := v_metrics.gifts_quests; v_required := 10;
    WHEN 'comm_join_1' THEN v_current := v_metrics.communities_joined; v_required := 1;
    WHEN 'comm_join_5' THEN v_current := v_metrics.communities_joined; v_required := 5;
    WHEN 'comm_topics_3' THEN v_current := v_metrics.community_topics; v_required := 3;
    WHEN 'comm_topics_25' THEN v_current := v_metrics.community_topics; v_required := 25;
    WHEN 'play_pub_1' THEN v_current := v_metrics.play_publishes; v_required := 1;
    WHEN 'play_pub_10' THEN v_current := v_metrics.play_publishes; v_required := 10;
    WHEN 'play_views_1k' THEN v_current := v_metrics.play_views_total; v_required := 1000;
    WHEN 'play_movie_1' THEN v_current := v_metrics.play_movies_completed; v_required := 1;
    WHEN 'play_movie_5' THEN v_current := v_metrics.play_movies_completed; v_required := 5;
    WHEN 'play_movie_15' THEN v_current := v_metrics.play_movies_completed; v_required := 15;
    WHEN 'play_visit_streak_10' THEN v_current := v_metrics.play_visit_streak_consec; v_required := 10;
    WHEN 'play_visit_30' THEN v_current := v_metrics.play_visit_days; v_required := 30;
    WHEN 'play_listen_streak_10' THEN v_current := v_metrics.play_listen_streak; v_required := 10;
    WHEN 'chat_50' THEN v_current := v_metrics.chat_messages; v_required := 50;
    WHEN 'chat_500' THEN v_current := v_metrics.chat_messages; v_required := 500;
    WHEN 'rooms_join_3' THEN v_current := v_metrics.rooms_joined; v_required := 3;
    WHEN 'rooms_msgs_25' THEN v_current := v_metrics.rooms_messages; v_required := 25;
    WHEN 'match_1' THEN v_current := v_metrics.matches_total; v_required := 1;
    WHEN 'match_10' THEN v_current := v_metrics.matches_total; v_required := 10;
    WHEN 'match_50' THEN v_current := v_metrics.matches_total; v_required := 50;
    WHEN 'rank_top100' THEN v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END; v_required := 1;
    WHEN 'rank_top10' THEN v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END; v_required := 1;
    WHEN 'meta_all_rares' THEN v_current := v_claimed_rares; v_required := array_length(v_rare_ids, 1);
    WHEN 'meta_all' THEN v_current := v_claimed_total; v_required := v_total_non_meta;
    ELSE RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  -- XP de cada conquista definido AQUI no servidor. O valor enviado pelo
  -- app (p_xp_reward) é ignorado: ninguém consegue pedir mais XP do que a
  -- conquista vale. Mesma tabela exibida nos cards do Aura Match.
  v_safe_xp := CASE p_achievement_id
    WHEN 'comm_join_1' THEN 500      WHEN 'play_pub_1' THEN 529
    WHEN 'play_movie_1' THEN 1500    WHEN 'match_1' THEN 586
    WHEN 'streak_3' THEN 614         WHEN 'comm_topics_3' THEN 643
    WHEN 'rooms_join_3' THEN 671     WHEN 'lvl_5' THEN 700
    WHEN 'likes_5' THEN 729          WHEN 'follows_5' THEN 757
    WHEN 'saves_5' THEN 786          WHEN 'comments_5' THEN 814
    WHEN 'polls_5' THEN 843          WHEN 'quests_10' THEN 871
    WHEN 'chat_50' THEN 900          WHEN 'rank_top100' THEN 1000
    WHEN 'gifts_3' THEN 1045         WHEN 'sdm_5' THEN 1091
    WHEN 'comm_join_5' THEN 1136     WHEN 'streak_7' THEN 1182
    WHEN 'lvl_10' THEN 1227          WHEN 'play_pub_10' THEN 1273
    WHEN 'play_visit_streak_10' THEN 1500  WHEN 'match_10' THEN 1364
    WHEN 'visits_15' THEN 1409       WHEN 'rooms_msgs_25' THEN 1455
    WHEN 'chat_500' THEN 1500        WHEN 'play_movie_5' THEN 5000
    WHEN 'lvl_20' THEN 1525          WHEN 'likes_25' THEN 1550
    WHEN 'follows_25' THEN 1575      WHEN 'saves_25' THEN 1600
    WHEN 'comments_25' THEN 1625     WHEN 'comm_topics_25' THEN 1650
    WHEN 'visits_30' THEN 1675       WHEN 'play_visit_30' THEN 2000
    WHEN 'quests_50' THEN 1725       WHEN 'match_50' THEN 10000
    WHEN 'xp_1000' THEN 1500         WHEN 'play_views_1k' THEN 10000
    WHEN 'rank_top10' THEN 1822      WHEN 'gifts_10' THEN 1867
    WHEN 'play_listen_streak_10' THEN 10000  WHEN 'play_movie_15' THEN 10000
    WHEN 'streak_30' THEN 1933       WHEN 'lvl_50' THEN 1956
    WHEN 'quests_200' THEN 1978      WHEN 'xp_10000' THEN 10000
    WHEN 'meta_all_rares' THEN 20000 WHEN 'meta_all' THEN 50000
    ELSE 0
  END;

  eligible := COALESCE(v_current, 0) >= COALESCE(v_required, 0) AND COALESCE(v_required, 0) > 0;
  rare := (v_safe_xp >= 10000) OR (p_achievement_id IN ('meta_all_rares','meta_all'));

  SELECT EXISTS(
    SELECT 1
    FROM public.oculto_aura_achievement_claims c
    WHERE c.user_id = v_uid
      AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  SELECT COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1)
  INTO xp_total, level
  FROM public.profiles p
  WHERE p.id = v_pid
  FOR UPDATE;

  IF already_claimed OR NOT eligible THEN
    awarded := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.oculto_aura_achievement_claims
    (user_id, profile_id, achievement_id, xp_awarded, applied_to_balance)
  VALUES
    (v_uid, v_pid, p_achievement_id, v_safe_xp, true)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    already_claimed := true;
    awarded := false;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
      aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
  WHERE id = v_pid
  RETURNING aura_xp, aura_level INTO xp_total, level;

  v_notif_title := COALESCE(NULLIF(trim(p_title), ''), 'Conquista desbloqueada');

  BEGIN
    INSERT INTO public.notifications(user_id, type, title, body, data)
    VALUES (
      v_uid,
      'system',
      CASE
        WHEN p_achievement_id IN ('meta_all_rares','meta_all') THEN '◆ Conquista PLATINA desbloqueada'
        WHEN rare THEN 'Conquista RARA desbloqueada'
        ELSE 'Conquista desbloqueada'
      END,
      v_notif_title || ' · +' || v_safe_xp::text || ' XP',
      jsonb_build_object(
        'kind', 'aura_achievement',
        'achievement_id', p_achievement_id,
        'xp', v_safe_xp,
        'rare', rare,
        'platinum', p_achievement_id IN ('meta_all_rares','meta_all')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF rare THEN
    INSERT INTO public.oculto_aura_rare_unlocks
      (user_id, profile_id, achievement_id, achievement_title, xp_awarded)
    VALUES
      (v_uid, v_pid, p_achievement_id, v_notif_title, v_safe_xp)
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;


NOTIFY pgrst, 'reload schema';
