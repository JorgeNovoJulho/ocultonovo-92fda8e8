-- ============================================================
-- Aura Match · Conquistas: resgate recusado com "Conquista ainda não
-- elegível para resgate no servidor".
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
--
-- Causa: a contagem de "dias diferentes de visita" (Explorador 15 dias,
-- Andarilho da Aura 30 dias) usava UMA consulta juntando xp_transactions e
-- engagement_events. Se uma das tabelas não existir, a consulta falhava e o
-- servidor contava 0 — a tela (que conta cada tabela em separado) mostrava
-- "Concluída", mas o servidor recusava o resgate.
--
-- Correções:
--  1) aura_achievements_metrics(): dias contados por tabela, cada uma em
--     bloco próprio; métricas consideram todos os perfis da conta.
--  2) aura_achievement_claim_v2(): usa a contagem robusta de dias.
--  3) Métricas do Oculto Play lidas em variáveis simples: se a função
--     oculto_play_user_metrics falhasse, TODAS as métricas (e todo resgate)
--     quebravam com "record v_play is not assigned yet".
--  Mesmas assinaturas — o app não precisa mudar para o resgate funcionar.
-- ============================================================

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
  play_movies_completed integer,
  chat_messages integer,
  rooms_joined integer,
  rooms_messages integer,
  matches_total integer,
  engagement_rank integer,
  rank_top100_flag integer,
  rank_top10_flag integer,
  play_listen_streak integer,
  play_visit_streak_consec integer,
  play_visit_days integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_ids uuid[];
  v_profile_xp integer := 0;
  v_profile_streak integer := 0;
  v_level_streak integer := 0;
  v_table_streak integer := 0;
  v_likes integer := 0;
  v_follows_a integer := 0;
  v_follows_b integer := 0;
  v_chat_gifts integer := 0;
  v_aura_gifts integer := 0;
  v_super_dms_a integer := 0;
  v_super_dms_b integer := 0;
  v_rank integer := 0;
  v_play_listen integer := 0;
  v_play_visit_streak integer := 0;
  v_play_visit_days integer := 0;
  v_days date[] := ARRAY[]::date[];
  v_tmp_days date[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_pid := public.aura_current_profile_id();
  -- Inclui TODOS os perfis da conta (há contas com linhas duplicadas em
  -- profiles); ações gravadas com o id de um perfil duplicado também contam.
  SELECT ARRAY(
    SELECT DISTINCT x
    FROM (
      SELECT unnest(ARRAY[v_uid, v_pid]) AS x
      UNION
      SELECT p.id FROM public.profiles p WHERE p.user_id = v_uid
    ) s
    WHERE x IS NOT NULL
  ) INTO v_ids;

  SELECT COALESCE(MAX(p.aura_xp), 0), COALESCE(MAX(p.aura_streak_days), 0)
  INTO v_profile_xp, v_profile_streak
  FROM public.profiles p
  WHERE p.user_id = v_uid OR p.id = ANY(v_ids);

  BEGIN SELECT COALESCE(MAX(streak_days), 0) INTO v_level_streak FROM public.user_levels WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_level_streak := 0; END;
  BEGIN SELECT COALESCE(MAX(current_streak), 0) INTO v_table_streak FROM public.oculto_aura_streaks WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_table_streak := 0; END;

  -- Dias distintos com atividade: cada tabela em seu próprio bloco. Antes
  -- era UMA consulta com UNION das duas; se `engagement_events` (ou
  -- `xp_transactions`) não existisse, a consulta inteira falhava e o
  -- servidor contava 0 dias — a tela mostrava "Concluída" e o resgate de
  -- "Explorador"/"Andarilho da Aura" era recusado.
  BEGIN
    SELECT COALESCE(array_agg(DISTINCT (created_at AT TIME ZONE 'UTC')::date), ARRAY[]::date[])
      INTO v_tmp_days FROM public.xp_transactions WHERE user_id = ANY(v_ids);
    v_days := v_days || v_tmp_days;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN
    SELECT COALESCE(array_agg(DISTINCT (created_at AT TIME ZONE 'UTC')::date), ARRAY[]::date[])
      INTO v_tmp_days FROM public.engagement_events WHERE user_id = ANY(v_ids);
    v_days := v_days || v_tmp_days;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT COUNT(DISTINCT d)::int INTO visit_days FROM unnest(v_days) AS d;

  BEGIN SELECT COUNT(*)::int INTO v_likes FROM public.post_likes WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_likes := 0; END;
  BEGIN v_likes := v_likes + COALESCE((SELECT COUNT(*)::int FROM public.profile_likes WHERE liker_id = ANY(v_ids)), 0); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT COUNT(*)::int INTO v_follows_a FROM public.followers WHERE follower_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_follows_a := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_follows_b FROM public.follows WHERE follower_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_follows_b := 0; END;
  follows_quests := GREATEST(v_follows_a, v_follows_b);

  BEGIN SELECT COUNT(*)::int INTO saves_quests FROM public.saved_posts WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN saves_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO comments_quests FROM public.post_comments WHERE user_id = ANY(v_ids) AND COALESCE(is_hidden, false) = false; EXCEPTION WHEN OTHERS THEN comments_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO polls_quests FROM public.poll_votes WHERE voter_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN polls_quests := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_chat_gifts FROM public.gift_history WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_chat_gifts := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_aura_gifts FROM public.oculto_aura_xp_gifts WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_aura_gifts := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_super_dms_a FROM public.priority_message_transactions WHERE sender_profile_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN v_super_dms_a := 0; END;
  BEGIN SELECT COUNT(*)::int INTO v_super_dms_b FROM public.messages WHERE sender_id = ANY(v_ids) AND COALESCE(is_priority, false) = true; EXCEPTION WHEN OTHERS THEN v_super_dms_b := 0; END;

  BEGIN SELECT COUNT(*)::int INTO communities_joined FROM public.oculto_community_members WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN communities_joined := 0; END;
  BEGIN SELECT COUNT(*)::int INTO community_topics FROM public.oculto_community_topics WHERE author_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN community_topics := 0; END;
  BEGIN SELECT COUNT(*)::int INTO play_publishes FROM public.oculto_play_items WHERE author_id = ANY(v_ids) AND COALESCE(is_published, false) = true; EXCEPTION WHEN OTHERS THEN play_publishes := 0; END;
  BEGIN SELECT COALESCE(SUM(view_count), 0)::int INTO play_views_total FROM public.oculto_play_items WHERE author_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN play_views_total := 0; END;
  BEGIN SELECT COUNT(*)::int INTO play_movies_completed FROM public.oculto_play_movie_completions WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN play_movies_completed := 0; END;
  BEGIN SELECT COUNT(*)::int INTO chat_messages FROM public.messages WHERE sender_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN chat_messages := 0; END;
  BEGIN SELECT COUNT(DISTINCT room_slug)::int INTO rooms_joined FROM public.oculto_aura_room_presence WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN rooms_joined := 0; END;
  BEGIN SELECT COUNT(*)::int INTO rooms_messages FROM public.oculto_aura_room_messages WHERE user_id = ANY(v_ids); EXCEPTION WHEN OTHERS THEN rooms_messages := 0; END;

  BEGIN
    SELECT COUNT(*)::int INTO matches_total FROM (
      SELECT 1 FROM public.perfect_pairs WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
      UNION ALL
      SELECT 1 FROM public.lucky_matches WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
      UNION ALL
      SELECT 1 FROM public.looking_now_matches WHERE user1_id = ANY(v_ids) OR user2_id = ANY(v_ids)
    ) m;
  EXCEPTION WHEN OTHERS THEN matches_total := 0; END;

  BEGIN SELECT COALESCE(r.rank, 0)::int INTO v_rank FROM public.aura_my_rank() AS r LIMIT 1; EXCEPTION WHEN OTHERS THEN v_rank := 0; END;
  -- Métricas do Play em variáveis simples: com `record`, se a função
  -- falhasse o acesso v_play.campo derrubava TODAS as métricas (e todo resgate).
  BEGIN
    SELECT COALESCE(m.listen_streak, 0)::int, COALESCE(m.visit_streak_consec, 0)::int, COALESCE(m.visit_days_total, 0)::int
      INTO v_play_listen, v_play_visit_streak, v_play_visit_days
      FROM public.oculto_play_user_metrics() AS m LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_play_listen := 0; v_play_visit_streak := 0; v_play_visit_days := 0;
  END;

  total_xp := GREATEST(0, v_profile_xp);
  current_level := public.aura_level_from_xp(total_xp);
  current_streak := GREATEST(v_profile_streak, v_level_streak, v_table_streak);
  visit_days := GREATEST(current_streak, COALESCE(visit_days, 0));
  likes_quests := v_likes;
  gifts_quests := v_chat_gifts + v_aura_gifts;
  super_dm_quests := GREATEST(v_super_dms_a, v_super_dms_b);
  quests_claimed := likes_quests + follows_quests + saves_quests + comments_quests + polls_quests + gifts_quests + super_dm_quests;
  engagement_rank := v_rank;
  rank_top100_flag := CASE WHEN v_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END;
  rank_top10_flag := CASE WHEN v_rank BETWEEN 1 AND 10 THEN 1 ELSE 0 END;
  play_listen_streak := COALESCE(v_play_listen, 0);
  play_visit_streak_consec := COALESCE(v_play_visit_streak, 0);
  play_visit_days := COALESCE(v_play_visit_days, 0);

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

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
  v_safe_xp integer;
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
    WHEN 'xp_10000' THEN v_current := GREATEST(v_metrics.total_xp, v_profile_xp); v_required := 10000;
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

  eligible := COALESCE(v_current, 0) >= COALESCE(v_required, 0) AND COALESCE(v_required, 0) > 0;
  rare := (p_xp_reward >= 10000) OR (p_achievement_id IN ('meta_all_rares','meta_all'));

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

  v_safe_xp := LEAST(50000, GREATEST(500, p_xp_reward));

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
