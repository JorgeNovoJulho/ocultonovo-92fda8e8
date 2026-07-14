-- =====================================================================
-- FIX 42P13: cannot change return type of existing function
-- Faz DROP explícito antes de recriar aura_achievements_metrics() e
-- aura_achievement_claim_v2(...) para permitir mudança de assinatura.
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) DROP das funções que mudaram de assinatura
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aura_achievements_metrics() CASCADE;
DROP FUNCTION IF EXISTS public.aura_achievement_claim_v2(text, integer, integer, integer, text) CASCADE;

-- ---------------------------------------------------------------------
-- 2) Recria aura_achievements_metrics (versão consolidada com rank fix
--    + streak_table + Oculto Play já considerados no claim)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp integer,
  current_level integer,
  current_streak integer,
  visit_days integer,
  quests_claimed integer,
  super_dm_quests integer,
  likes_quests integer,
  follows_quests integer,
  saves_quests integer,
  comments_quests integer,
  polls_quests integer,
  gifts_quests integer,
  communities_joined integer,
  community_topics integer,
  play_publishes integer,
  play_views_total integer,
  chat_messages integer,
  rooms_joined integer,
  rooms_messages integer,
  matches_total integer,
  engagement_rank integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_profile_xp integer := 0;
  v_profile_level integer := 1;
  v_profile_streak integer := 0;
  v_level_xp integer := 0;
  v_level_level integer := 1;
  v_level_streak integer := 0;
  v_ledger_xp integer := 0;
  v_claim_xp integer := 0;
  v_visit_days integer := 0;
  v_likes integer := 0;
  v_follows integer := 0;
  v_saves integer := 0;
  v_comments integer := 0;
  v_polls integer := 0;
  v_chat_gifts integer := 0;
  v_aura_gifts integer := 0;
  v_super_dms integer := 0;
  v_comm_join integer := 0;
  v_comm_topics integer := 0;
  v_play_pub integer := 0;
  v_play_views integer := 0;
  v_chat_msgs integer := 0;
  v_rooms_msgs integer := 0;
  v_matches integer := 0;
  v_rank integer := 0;
  v_streak_table integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT id, COALESCE(aura_xp,0), COALESCE(aura_level,1), COALESCE(aura_streak_days,0)
    INTO v_pid, v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles WHERE user_id = v_uid
    ORDER BY created_at ASC NULLS LAST LIMIT 1;

  SELECT COALESCE(MAX(total_xp),0), COALESCE(MAX(current_level),1), COALESCE(MAX(streak_days),0)
    INTO v_level_xp, v_level_level, v_level_streak
    FROM public.user_levels WHERE user_id = v_uid;

  SELECT COALESCE(SUM(GREATEST(amount,0)),0) INTO v_ledger_xp
    FROM public.xp_transactions WHERE user_id = v_uid;

  SELECT COALESCE(SUM(xp_awarded),0) INTO v_claim_xp
    FROM public.oculto_aura_achievement_claims WHERE user_id = v_uid;

  SELECT COUNT(DISTINCT date_trunc('day', created_at))::int INTO v_visit_days
    FROM public.engagement_events WHERE user_id = v_uid;

  BEGIN
    SELECT COALESCE(MAX(current_streak),0) INTO v_streak_table
      FROM public.oculto_aura_streaks WHERE user_id = v_uid;
  EXCEPTION WHEN OTHERS THEN v_streak_table := 0; END;

  SELECT COUNT(*) INTO v_likes FROM public.post_likes WHERE user_id = v_uid;
  SELECT COUNT(*) INTO v_follows FROM public.follows WHERE follower_id = v_uid;
  SELECT COUNT(*) INTO v_saves FROM public.saved_posts WHERE user_id = v_uid;
  SELECT COUNT(*) INTO v_comments FROM public.post_comments WHERE user_id = v_uid AND COALESCE(is_hidden,false)=false;
  BEGIN SELECT COUNT(*) INTO v_polls FROM public.poll_votes WHERE voter_id = v_uid; EXCEPTION WHEN OTHERS THEN v_polls := 0; END;
  SELECT COUNT(*) INTO v_chat_gifts FROM public.gift_history WHERE sender_id = v_uid;
  BEGIN SELECT COUNT(*) INTO v_aura_gifts FROM public.oculto_aura_xp_gifts WHERE sender_id = v_uid; EXCEPTION WHEN OTHERS THEN v_aura_gifts := 0; END;
  BEGIN SELECT COUNT(*) INTO v_super_dms FROM public.priority_message_transactions WHERE sender_profile_id = v_pid; EXCEPTION WHEN OTHERS THEN v_super_dms := 0; END;
  BEGIN SELECT COUNT(*) INTO v_comm_join FROM public.oculto_community_members WHERE user_id = v_uid; EXCEPTION WHEN OTHERS THEN v_comm_join := 0; END;
  BEGIN SELECT COUNT(*) INTO v_comm_topics FROM public.oculto_community_topics WHERE author_id = v_uid; EXCEPTION WHEN OTHERS THEN v_comm_topics := 0; END;
  BEGIN SELECT COUNT(*) INTO v_play_pub FROM public.oculto_play_items WHERE author_id = v_uid AND COALESCE(is_published,false)=true; EXCEPTION WHEN OTHERS THEN v_play_pub := 0; END;
  BEGIN SELECT COALESCE(SUM(view_count),0)::int INTO v_play_views FROM public.oculto_play_items WHERE author_id = v_uid; EXCEPTION WHEN OTHERS THEN v_play_views := 0; END;
  SELECT COUNT(*) INTO v_chat_msgs FROM public.messages WHERE sender_id = v_uid;
  BEGIN SELECT COUNT(*) INTO v_rooms_msgs FROM public.oculto_aura_room_messages WHERE author_id = v_uid; EXCEPTION WHEN OTHERS THEN v_rooms_msgs := 0; END;

  BEGIN
    SELECT COUNT(*) INTO v_matches FROM (
      SELECT 1 FROM public.perfect_pairs WHERE user1_id = v_uid OR user2_id = v_uid
      UNION ALL
      SELECT 1 FROM public.lucky_matches WHERE user1_id = v_uid OR user2_id = v_uid
      UNION ALL
      SELECT 1 FROM public.looking_now_matches WHERE user1_id = v_uid OR user2_id = v_uid
    ) m;
  EXCEPTION WHEN OTHERS THEN v_matches := 0; END;

  BEGIN
    SELECT COALESCE(r.rank, 0)::int INTO v_rank
      FROM public.aura_my_rank() AS r LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_rank := 0; END;

  total_xp := GREATEST(v_profile_xp, v_level_xp, v_ledger_xp, v_claim_xp);
  current_level := GREATEST(v_profile_level, v_level_level, public.aura_level_from_xp(total_xp));
  current_streak := GREATEST(v_profile_streak, v_level_streak, v_streak_table);
  visit_days := GREATEST(current_streak, v_visit_days);
  likes_quests := v_likes;
  follows_quests := v_follows;
  saves_quests := v_saves;
  comments_quests := v_comments;
  polls_quests := v_polls;
  gifts_quests := v_chat_gifts + v_aura_gifts;
  super_dm_quests := v_super_dms;
  quests_claimed := likes_quests + follows_quests + saves_quests + comments_quests + polls_quests + gifts_quests + super_dm_quests;
  communities_joined := v_comm_join;
  community_topics := v_comm_topics;
  play_publishes := v_play_pub;
  play_views_total := v_play_views;
  chat_messages := v_chat_msgs;
  rooms_joined := 0;
  rooms_messages := v_rooms_msgs;
  matches_total := v_matches;
  engagement_rank := v_rank;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Recria aura_achievement_claim_v2 (com Oculto Play + GREATEST fallback)
-- ---------------------------------------------------------------------
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
    WHEN 'play_listen_streak_10' THEN v_metric_val := COALESCE(v_play.listen_streak, 0); v_required := 10;
    WHEN 'play_visit_streak_10'  THEN v_metric_val := COALESCE(v_play.visit_streak_consec, 0); v_required := 10;
    WHEN 'play_visit_30'         THEN v_metric_val := COALESCE(v_play.visit_days_total, 0); v_required := 30;
    ELSE RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

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
