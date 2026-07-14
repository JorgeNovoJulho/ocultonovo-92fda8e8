-- =====================================================================
-- Aura Match — Métricas de "follows_quests" considerando ambas as tabelas
-- históricas ("followers" e "follows"). Idempotente. Cole inteiro no
-- SQL Editor do Supabase EXTERNO.
-- Corrige: conquista "Tecendo a Rede"/"Conector Nato" travada em 0 mesmo
-- com dezenas de perfis seguidos (registros vivem em public.followers).
-- =====================================================================

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
  gifts_quests integer
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

  SELECT COALESCE(MAX(ul.total_xp), 0),
         COALESCE(MAX(ul.current_level), 1),
         COALESCE(MAX(ul.streak_days), 0)
    INTO v_level_xp, v_level_level, v_level_streak
    FROM public.user_levels ul
   WHERE ul.user_id = ANY(v_ids);

  SELECT COALESCE(SUM(GREATEST(0, xt.amount)), 0)::integer
    INTO v_ledger_xp
    FROM public.xp_transactions xt
   WHERE xt.user_id = ANY(v_ids);

  SELECT COALESCE(SUM(GREATEST(0, c.xp_awarded)), 0)::integer
    INTO v_claim_xp
    FROM public.oculto_aura_achievement_claims c
   WHERE c.user_id = v_uid OR c.profile_id = v_pid;

  SELECT COALESCE(COUNT(DISTINCT d), 0)::integer
    INTO v_visit_days
    FROM (
      SELECT xt.created_at::date AS d FROM public.xp_transactions xt WHERE xt.user_id = ANY(v_ids)
      UNION
      SELECT ee.created_at::date AS d FROM public.engagement_events ee WHERE ee.user_id = ANY(v_ids)
    ) days;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_likes
    FROM public.post_likes pl
   WHERE pl.user_id = ANY(v_ids);

  SELECT v_likes + COALESCE(COUNT(*), 0)::integer INTO v_likes
    FROM public.profile_likes pfl
   WHERE pfl.liker_id = ANY(v_ids);

  -- Follows: soma robusta entre as duas tabelas históricas
  -- (algumas instalações populam "followers", outras "follows").
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

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_saves
    FROM public.saved_posts sp
   WHERE sp.user_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_comments
    FROM public.post_comments pc
   WHERE pc.user_id = ANY(v_ids)
     AND COALESCE(pc.is_hidden, false) = false;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_polls
    FROM public.poll_votes pv
   WHERE pv.voter_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_chat_gifts
    FROM public.gift_history gh
   WHERE gh.sender_id = ANY(v_ids)
     AND COALESCE(gh.is_visible, true) = true;

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_aura_gifts
    FROM public.oculto_aura_xp_gifts ag
   WHERE ag.sender_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_super_dms
    FROM public.priority_message_transactions pmt
   WHERE pmt.sender_profile_id = ANY(v_ids);

  SELECT COALESCE(COUNT(*), 0)::integer INTO v_super_dms2
    FROM public.messages m
   WHERE m.sender_id = ANY(v_ids)
     AND COALESCE(m.is_priority, false) = true;
  v_super_dms := GREATEST(v_super_dms, v_super_dms2);

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

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

NOTIFY pgrst, 'reload schema';
