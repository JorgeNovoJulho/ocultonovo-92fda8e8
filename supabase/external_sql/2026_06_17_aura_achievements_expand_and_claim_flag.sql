-- =====================================================================
-- Aura Match — Expansão de conquistas (comunidades, oculto play, chat,
-- salas, matches e ranking) + flag "applied_to_balance" para impedir
-- duplicidade e garantir crédito de XP retroativo.
-- Idempotente. Cole inteiro no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Coluna de controle de crédito ao saldo do usuário.
ALTER TABLE public.oculto_aura_achievement_claims
  ADD COLUMN IF NOT EXISTS applied_to_balance boolean NOT NULL DEFAULT false;

-- 2) Backfill: para claims antigos que nunca foram aplicados ao saldo,
-- credita aura_xp no profile do usuário e marca como aplicado.
DO $$
DECLARE
  r record;
  v_pid uuid;
BEGIN
  FOR r IN
    SELECT id, user_id, profile_id, xp_awarded
      FROM public.oculto_aura_achievement_claims
     WHERE applied_to_balance = false
  LOOP
    v_pid := COALESCE(r.profile_id, public.aura_resolve_profile_id(r.user_id));
    IF v_pid IS NULL THEN CONTINUE; END IF;
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + COALESCE(r.xp_awarded, 0)),
           aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + COALESCE(r.xp_awarded, 0)))
     WHERE id = v_pid;
    UPDATE public.oculto_aura_achievement_claims
       SET applied_to_balance = true,
           profile_id = COALESCE(profile_id, v_pid)
     WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Métricas estendidas com novos campos de engajamento.
DROP FUNCTION IF EXISTS public.aura_achievements_metrics();

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_ids uuid[];
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
  v_follows_a integer := 0;
  v_follows_b integer := 0;
  v_follows integer := 0;
  v_saves integer := 0;
  v_comments integer := 0;
  v_polls integer := 0;
  v_chat_gifts integer := 0;
  v_aura_gifts integer := 0;
  v_super_dms integer := 0;
  v_super_dms2 integer := 0;
  v_comm_join integer := 0;
  v_comm_topics integer := 0;
  v_play_pub integer := 0;
  v_play_views integer := 0;
  v_chat_msgs integer := 0;
  v_rooms_join integer := 0;
  v_rooms_msgs integer := 0;
  v_matches integer := 0;
  v_rank integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_pid := public.aura_current_profile_id();
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[v_uid, v_pid]) AS x WHERE x IS NOT NULL) INTO v_ids;

  SELECT COALESCE(MAX(p.aura_xp), 0),
         COALESCE(MAX(p.aura_level), 1),
         COALESCE(MAX(p.aura_streak_days), 0)
    INTO v_profile_xp, v_profile_level, v_profile_streak
    FROM public.profiles p
   WHERE p.id = ANY(v_ids) OR p.user_id = v_uid;

  BEGIN
    SELECT COALESCE(MAX(ul.total_xp), 0),
           COALESCE(MAX(ul.current_level), 1),
           COALESCE(MAX(ul.streak_days), 0)
      INTO v_level_xp, v_level_level, v_level_streak
      FROM public.user_levels ul
     WHERE ul.user_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(SUM(GREATEST(0, xt.amount)), 0)::integer
      INTO v_ledger_xp
      FROM public.xp_transactions xt
     WHERE xt.user_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  SELECT COALESCE(SUM(GREATEST(0, c.xp_awarded)), 0)::integer
    INTO v_claim_xp
    FROM public.oculto_aura_achievement_claims c
   WHERE c.user_id = v_uid OR c.profile_id = v_pid;

  BEGIN
    SELECT COALESCE(COUNT(DISTINCT d), 0)::integer
      INTO v_visit_days
      FROM (
        SELECT xt.created_at::date AS d FROM public.xp_transactions xt WHERE xt.user_id = ANY(v_ids)
        UNION
        SELECT ee.created_at::date AS d FROM public.engagement_events ee WHERE ee.user_id = ANY(v_ids)
      ) days;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_likes
      FROM public.post_likes pl WHERE pl.user_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT v_likes + COALESCE(COUNT(*), 0)::integer INTO v_likes
      FROM public.profile_likes pfl WHERE pfl.liker_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- follows (followers + follows, máximo)
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_follows_a
      FROM public.followers f WHERE f.follower_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_follows_a := 0;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_follows_b
      FROM public.follows f WHERE f.follower_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_follows_b := 0;
  END;
  v_follows := GREATEST(v_follows_a, v_follows_b);

  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_saves
      FROM public.saved_posts sp WHERE sp.user_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_comments
      FROM public.post_comments pc
     WHERE pc.user_id = ANY(v_ids) AND COALESCE(pc.is_hidden, false) = false;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_polls
      FROM public.poll_votes pv WHERE pv.voter_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_chat_gifts
      FROM public.gift_history gh
     WHERE gh.sender_id = ANY(v_ids) AND COALESCE(gh.is_visible, true) = true;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_aura_gifts
      FROM public.oculto_aura_xp_gifts ag WHERE ag.sender_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_super_dms
      FROM public.priority_message_transactions pmt WHERE pmt.sender_profile_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_super_dms2
      FROM public.messages m
     WHERE m.sender_id = ANY(v_ids) AND COALESCE(m.is_priority, false) = true;
    v_super_dms := GREATEST(v_super_dms, v_super_dms2);
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- COMUNIDADES
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_comm_join
      FROM public.oculto_community_members cm
     WHERE cm.user_id = ANY(v_ids)
       AND COALESCE(cm.status, 'active') IN ('active','approved','member');
  EXCEPTION WHEN undefined_table THEN v_comm_join := 0;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_comm_topics
      FROM public.oculto_community_topics ct
     WHERE ct.author_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_comm_topics := 0;
  END;

  -- OCULTO PLAY
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer,
           COALESCE(SUM(GREATEST(0, COALESCE(i.view_count, 0))), 0)::integer
      INTO v_play_pub, v_play_views
      FROM public.oculto_play_items i
     WHERE i.author_id = ANY(v_ids)
       AND COALESCE(i.is_published, true) = true;
  EXCEPTION WHEN undefined_table THEN v_play_pub := 0; v_play_views := 0;
  END;

  -- CHAT (mensagens enviadas — exceto priority já contadas em super_dm)
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_chat_msgs
      FROM public.messages m
     WHERE m.sender_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_chat_msgs := 0;
  END;

  -- SALAS DE BATE-PAPO AO VIVO
  BEGIN
    SELECT COALESCE(COUNT(DISTINCT room_id), 0)::integer INTO v_rooms_join
      FROM public.oculto_aura_room_messages
     WHERE author_id = ANY(v_ids) OR sender_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_rooms_join := 0;
            WHEN undefined_column THEN
    BEGIN
      SELECT COALESCE(COUNT(DISTINCT room_id), 0)::integer INTO v_rooms_join
        FROM public.oculto_aura_room_messages WHERE author_id = ANY(v_ids);
    EXCEPTION WHEN OTHERS THEN v_rooms_join := 0;
    END;
  END;
  BEGIN
    SELECT COALESCE(COUNT(*), 0)::integer INTO v_rooms_msgs
      FROM public.oculto_aura_room_messages
     WHERE author_id = ANY(v_ids) OR sender_id = ANY(v_ids);
  EXCEPTION WHEN undefined_table THEN v_rooms_msgs := 0;
            WHEN undefined_column THEN
    BEGIN
      SELECT COALESCE(COUNT(*), 0)::integer INTO v_rooms_msgs
        FROM public.oculto_aura_room_messages WHERE author_id = ANY(v_ids);
    EXCEPTION WHEN OTHERS THEN v_rooms_msgs := 0;
    END;
  END;

  -- MATCHES (perfect_pairs + lucky_matches + looking_now_matches)
  DECLARE v_m1 integer := 0; v_m2 integer := 0; v_m3 integer := 0;
  BEGIN
    BEGIN
      SELECT COALESCE(COUNT(*), 0)::integer INTO v_m1
        FROM public.perfect_pairs pp
       WHERE pp.user1_id = ANY(v_ids) OR pp.user2_id = ANY(v_ids);
    EXCEPTION WHEN undefined_table THEN v_m1 := 0;
              WHEN undefined_column THEN v_m1 := 0;
    END;
    BEGIN
      SELECT COALESCE(COUNT(*), 0)::integer INTO v_m2
        FROM public.lucky_matches lm
       WHERE lm.user1_id = ANY(v_ids) OR lm.user2_id = ANY(v_ids);
    EXCEPTION WHEN undefined_table THEN v_m2 := 0;
              WHEN undefined_column THEN v_m2 := 0;
    END;
    BEGIN
      SELECT COALESCE(COUNT(*), 0)::integer INTO v_m3
        FROM public.looking_now_matches lnm
       WHERE lnm.user1_id = ANY(v_ids) OR lnm.user2_id = ANY(v_ids);
    EXCEPTION WHEN undefined_table THEN v_m3 := 0;
              WHEN undefined_column THEN v_m3 := 0;
    END;
    v_matches := v_m1 + v_m2 + v_m3;
  END;

  -- RANKING DE ENGAJAMENTO (menor = melhor; 0 = sem ranking)
  BEGIN
    SELECT COALESCE(aura_my_rank, 0)::integer INTO v_rank
      FROM public.aura_my_rank() AS aura_my_rank;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      SELECT COALESCE((public.aura_my_rank())::integer, 0) INTO v_rank;
    EXCEPTION WHEN OTHERS THEN v_rank := 0;
    END;
  END;

  total_xp := GREATEST(v_profile_xp, v_level_xp, v_ledger_xp, v_claim_xp);
  current_level := GREATEST(v_profile_level, v_level_level, public.aura_level_from_xp(total_xp));
  current_streak := GREATEST(v_profile_streak, v_level_streak);
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
  rooms_joined := v_rooms_join;
  rooms_messages := v_rooms_msgs;
  matches_total := v_matches;
  engagement_rank := v_rank;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

-- 4) Claim atualizado: aceita as novas conquistas e marca applied_to_balance.
DROP FUNCTION IF EXISTS public.aura_achievement_claim(text, integer);

CREATE OR REPLACE FUNCTION public.aura_achievement_claim(
  p_achievement_id text,
  p_xp_reward integer
)
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  current_value integer,
  required_value integer,
  already_claimed boolean
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
  v_safe_xp integer;
  v_inserted integer := 0;
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

  CASE p_achievement_id
    WHEN 'lvl_5' THEN v_current := v_metrics.current_level; v_required := 5;
    WHEN 'lvl_10' THEN v_current := v_metrics.current_level; v_required := 10;
    WHEN 'lvl_20' THEN v_current := v_metrics.current_level; v_required := 20;
    WHEN 'lvl_50' THEN v_current := v_metrics.current_level; v_required := 50;
    WHEN 'streak_3' THEN v_current := v_metrics.current_streak; v_required := 3;
    WHEN 'streak_7' THEN v_current := v_metrics.current_streak; v_required := 7;
    WHEN 'streak_30' THEN v_current := v_metrics.current_streak; v_required := 30;
    WHEN 'visits_15' THEN v_current := v_metrics.visit_days; v_required := 15;
    WHEN 'visits_30' THEN v_current := v_metrics.visit_days; v_required := 30;
    WHEN 'quests_10' THEN v_current := v_metrics.quests_claimed; v_required := 10;
    WHEN 'quests_50' THEN v_current := v_metrics.quests_claimed; v_required := 50;
    WHEN 'quests_200' THEN v_current := v_metrics.quests_claimed; v_required := 200;
    WHEN 'sdm_5' THEN v_current := v_metrics.super_dm_quests; v_required := 5;
    WHEN 'xp_1000' THEN v_current := v_metrics.total_xp; v_required := 1000;
    WHEN 'xp_10000' THEN v_current := v_metrics.total_xp; v_required := 10000;
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
    -- Novos
    WHEN 'comm_join_1' THEN v_current := v_metrics.communities_joined; v_required := 1;
    WHEN 'comm_join_5' THEN v_current := v_metrics.communities_joined; v_required := 5;
    WHEN 'comm_topics_3' THEN v_current := v_metrics.community_topics; v_required := 3;
    WHEN 'comm_topics_25' THEN v_current := v_metrics.community_topics; v_required := 25;
    WHEN 'play_pub_1' THEN v_current := v_metrics.play_publishes; v_required := 1;
    WHEN 'play_pub_10' THEN v_current := v_metrics.play_publishes; v_required := 10;
    WHEN 'play_views_1k' THEN v_current := v_metrics.play_views_total; v_required := 1000;
    WHEN 'chat_50' THEN v_current := v_metrics.chat_messages; v_required := 50;
    WHEN 'chat_500' THEN v_current := v_metrics.chat_messages; v_required := 500;
    WHEN 'rooms_join_3' THEN v_current := v_metrics.rooms_joined; v_required := 3;
    WHEN 'rooms_msgs_25' THEN v_current := v_metrics.rooms_messages; v_required := 25;
    WHEN 'match_1' THEN v_current := v_metrics.matches_total; v_required := 1;
    WHEN 'match_10' THEN v_current := v_metrics.matches_total; v_required := 10;
    WHEN 'match_50' THEN v_current := v_metrics.matches_total; v_required := 50;
    WHEN 'rank_top100' THEN
      -- rank: menor = melhor, 0 = sem ranking
      v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END;
      v_required := 1;
    WHEN 'rank_top10' THEN
      v_current := CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END;
      v_required := 1;
    ELSE
      RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END CASE;

  current_value := COALESCE(v_current, 0);
  required_value := COALESCE(v_required, 0);
  eligible := current_value >= required_value;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  SELECT COALESCE(p.aura_xp, 0), COALESCE(p.aura_level, 1)
    INTO xp_total, level
    FROM public.profiles p
   WHERE p.id = v_pid;

  IF already_claimed THEN
    awarded := false; RETURN NEXT; RETURN;
  END IF;
  IF NOT eligible THEN
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
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
   WHERE id = v_pid
   RETURNING aura_xp, aura_level
    INTO xp_total, level;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
