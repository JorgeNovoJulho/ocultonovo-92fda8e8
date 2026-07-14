-- =====================================================================
-- Aura Match — Correção definitiva das Conquistas por dados reais
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================
DROP FUNCTION IF EXISTS public.aura_achievements_metrics();

CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp         integer,
  current_level    integer,
  current_streak   integer,
  visit_days       integer,
  quests_claimed   integer,
  super_dm_quests  integer,
  likes_quests     integer,
  follows_quests   integer,
  saves_quests     integer,
  comments_quests  integer,
  polls_quests     integer,
  gifts_quests     integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_ids uuid[];
  v_total_xp integer := 0;
  v_current_level integer := 1;
  v_streak integer := 0;
  v_visit_days integer := 0;
  v_likes integer := 0;
  v_follows integer := 0;
  v_saves integer := 0;
  v_comments integer := 0;
  v_polls integer := 0;
  v_gifts integer := 0;
  v_super_dms integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT p.id INTO v_pid FROM public.profiles p WHERE p.user_id = v_uid LIMIT 1;
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[v_uid, v_pid]) AS x WHERE x IS NOT NULL) INTO v_ids;

  SELECT GREATEST(
    COALESCE((SELECT p.aura_xp FROM public.profiles p WHERE p.user_id = v_uid LIMIT 1), 0),
    COALESCE((SELECT MAX(ul.total_xp)::int FROM public.user_levels ul WHERE ul.user_id = ANY(v_ids)), 0),
    COALESCE((SELECT SUM(xt.amount)::int FROM public.xp_transactions xt WHERE xt.user_id = ANY(v_ids)), 0)
  ) INTO v_total_xp;

  SELECT GREATEST(
    COALESCE((SELECT MAX(ul.current_level)::int FROM public.user_levels ul WHERE ul.user_id = ANY(v_ids)), 1),
    COALESCE((SELECT public.aura_level_from_xp(v_total_xp)), GREATEST(1, FLOOR(SQRT(GREATEST(v_total_xp, 0)::numeric / 50))::int + 1))
  ) INTO v_current_level;

  SELECT COALESCE(MAX(ul.streak_days)::int, 0) INTO v_streak FROM public.user_levels ul WHERE ul.user_id = ANY(v_ids);

  SELECT COALESCE(COUNT(DISTINCT d)::int, 0) INTO v_visit_days
  FROM (
    SELECT xt.created_at::date AS d FROM public.xp_transactions xt WHERE xt.user_id = ANY(v_ids)
    UNION
    SELECT ee.created_at::date AS d FROM public.engagement_events ee WHERE ee.user_id = ANY(v_ids)
  ) days;

  SELECT COALESCE(COUNT(*)::int, 0) INTO v_likes FROM public.post_likes pl WHERE pl.user_id = ANY(v_ids);
  v_likes := v_likes + COALESCE((SELECT COUNT(*)::int FROM public.profile_likes pfl WHERE pfl.liker_id = ANY(v_ids)), 0);
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_follows FROM public.follows f WHERE f.follower_id = ANY(v_ids);
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_saves FROM public.saved_posts sp WHERE sp.user_id = ANY(v_ids);
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_comments FROM public.post_comments pc WHERE pc.user_id = ANY(v_ids) AND COALESCE(pc.is_hidden, false) = false;
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_polls FROM public.poll_votes pv WHERE pv.voter_id = ANY(v_ids);
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_gifts FROM public.gift_history gh WHERE gh.sender_id = ANY(v_ids);
  SELECT COALESCE(COUNT(*)::int, 0) INTO v_super_dms FROM public.priority_message_transactions pmt WHERE pmt.sender_profile_id = ANY(v_ids);
  v_super_dms := GREATEST(v_super_dms, COALESCE((SELECT COUNT(*)::int FROM public.messages m WHERE m.sender_id = ANY(v_ids) AND COALESCE(m.is_priority, false) = true), 0));

  total_xp := v_total_xp;
  current_level := v_current_level;
  current_streak := v_streak;
  visit_days := GREATEST(v_streak, v_visit_days);
  quests_claimed := v_likes + v_follows + v_saves + v_comments + v_polls + v_gifts + v_super_dms;
  super_dm_quests := v_super_dms;
  likes_quests := v_likes;
  follows_quests := v_follows;
  saves_quests := v_saves;
  comments_quests := v_comments;
  polls_quests := v_polls;
  gifts_quests := v_gifts;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;
NOTIFY pgrst, 'reload schema';
