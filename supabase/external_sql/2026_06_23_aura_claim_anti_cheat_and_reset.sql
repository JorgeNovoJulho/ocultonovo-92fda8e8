-- =============================================================================
-- FIX CRÍTICO ANTI-CHEAT: aura_achievement_claim_v2
--
-- BUG: a versão anterior fazia `v_current := GREATEST(v_metric_val, v_client)`,
-- confiando no `p_current` enviado pelo cliente. Isso permitia que QUALQUER
-- usuário recém-cadastrado (com aura_xp=0, level=1) chamasse a RPC com
-- p_current=10000 e ganhasse a conquista RARA "Sol Interior" + 10.000 XP.
--
-- FIX:
--   1) Ignora p_current para elegibilidade — usa SOMENTE o valor calculado
--      server-side pela view de métricas. p_current vira apenas telemetria.
--   2) Cap server-side de XP por conquista vem de uma tabela fixa de rewards
--      (não confia mais no p_xp_reward enviado pelo cliente).
--   3) Reverte o claim indevido do usuário afetado:
--        - remove de oculto_aura_achievement_claims
--        - desconta do profiles.aura_xp / recalcula aura_level
--        - apaga do oculto_aura_rare_unlocks (broadcast)
--        - apaga notificação correspondente
--
-- Idempotente. Pode rodar várias vezes sem efeito colateral.
-- =============================================================================

BEGIN;

-- 1) Tabela canônica de rewards server-side (fonte da verdade do XP por conquista).
CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_rewards (
  achievement_id text PRIMARY KEY,
  xp_reward      integer NOT NULL CHECK (xp_reward BETWEEN 100 AND 10000),
  required       integer NOT NULL CHECK (required > 0),
  metric         text    NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oculto_aura_achievement_rewards TO authenticated, anon;
GRANT ALL    ON public.oculto_aura_achievement_rewards TO service_role;
ALTER TABLE public.oculto_aura_achievement_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rewards public read" ON public.oculto_aura_achievement_rewards;
CREATE POLICY "rewards public read" ON public.oculto_aura_achievement_rewards
  FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.oculto_aura_achievement_rewards(achievement_id, xp_reward, required, metric) VALUES
  ('lvl_5',500,5,'current_level'),
  ('lvl_10',1500,10,'current_level'),
  ('lvl_20',3500,20,'current_level'),
  ('lvl_50',10000,50,'current_level'),
  ('streak_3',500,3,'current_streak'),
  ('streak_7',1500,7,'current_streak'),
  ('streak_30',10000,30,'current_streak'),
  ('visits_15',2500,15,'visit_days'),
  ('visits_30',5500,30,'visit_days'),
  ('quests_10',500,10,'quests_claimed'),
  ('quests_50',5500,50,'quests_claimed'),
  ('quests_200',10000,200,'quests_claimed'),
  ('sdm_5',1500,5,'super_dm_quests'),
  ('xp_1000',3500,1000,'total_xp'),
  ('xp_10000',10000,10000,'total_xp'),
  ('likes_5',500,5,'likes_quests'),
  ('likes_25',5500,25,'likes_quests'),
  ('follows_5',500,5,'follows_quests'),
  ('follows_25',5500,25,'follows_quests'),
  ('saves_5',500,5,'saves_quests'),
  ('saves_25',5500,25,'saves_quests'),
  ('comments_5',500,5,'comments_quests'),
  ('comments_25',5500,25,'comments_quests'),
  ('polls_5',500,5,'polls_quests'),
  ('gifts_3',1500,3,'gifts_quests'),
  ('gifts_10',10000,10,'gifts_quests'),
  ('comm_join_1',500,1,'communities_joined'),
  ('comm_join_5',1500,5,'communities_joined'),
  ('comm_topics_3',500,3,'community_topics'),
  ('comm_topics_25',5500,25,'community_topics'),
  ('play_pub_1',500,1,'play_publishes'),
  ('play_pub_10',1500,10,'play_publishes'),
  ('play_views_1k',10000,1000,'play_views_total'),
  ('chat_50',500,50,'chat_messages'),
  ('chat_500',1500,500,'chat_messages'),
  ('rooms_join_3',500,3,'rooms_joined'),
  ('rooms_msgs_25',1500,25,'rooms_messages'),
  ('match_1',500,1,'matches_total'),
  ('match_10',1500,10,'matches_total'),
  ('match_50',10000,50,'matches_total'),
  ('rank_top100',1500,1,'rank_top100_flag'),
  ('rank_top10',10000,1,'rank_top10_flag'),
  ('play_listen_streak_10',10000,10,'play_listen_streak'),
  ('play_visit_streak_10',1500,10,'play_visit_streak_consec'),
  ('play_visit_30',3500,30,'play_visit_days')
ON CONFLICT (achievement_id) DO UPDATE
  SET xp_reward = EXCLUDED.xp_reward,
      required  = EXCLUDED.required,
      metric    = EXCLUDED.metric,
      updated_at = now();

-- 2) Função blindada: ignora p_current e p_xp_reward do cliente
CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,  -- mantido por compat; será SOBRESCRITO server-side
  p_current   integer,  -- IGNORADO para elegibilidade — apenas telemetria
  p_required  integer,  -- IGNORADO
  p_title     text DEFAULT NULL
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
  v_reward record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN
    RAISE EXCEPTION 'achievement id required';
  END IF;

  -- Reward server-side (autoritativo). Se o id não existir, rejeita.
  SELECT * INTO v_reward FROM public.oculto_aura_achievement_rewards
   WHERE achievement_id = p_achievement_id;
  IF v_reward IS NULL THEN
    RAISE EXCEPTION 'unknown achievement id: %', p_achievement_id;
  END IF;
  v_required := v_reward.required;
  v_safe_xp  := LEAST(10000, GREATEST(100, v_reward.xp_reward));

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

  -- Valor da métrica vem APENAS do servidor. p_current é descartado.
  v_metric_val := CASE p_achievement_id
    WHEN 'lvl_5'  THEN GREATEST(v_metrics.current_level, v_profile_level)
    WHEN 'lvl_10' THEN GREATEST(v_metrics.current_level, v_profile_level)
    WHEN 'lvl_20' THEN GREATEST(v_metrics.current_level, v_profile_level)
    WHEN 'lvl_50' THEN GREATEST(v_metrics.current_level, v_profile_level)
    WHEN 'streak_3'  THEN GREATEST(v_metrics.current_streak, v_profile_streak)
    WHEN 'streak_7'  THEN GREATEST(v_metrics.current_streak, v_profile_streak)
    WHEN 'streak_30' THEN GREATEST(v_metrics.current_streak, v_profile_streak)
    WHEN 'visits_15' THEN GREATEST(v_metrics.visit_days, v_profile_streak)
    WHEN 'visits_30' THEN GREATEST(v_metrics.visit_days, v_profile_streak)
    WHEN 'quests_10'  THEN v_metrics.quests_claimed
    WHEN 'quests_50'  THEN v_metrics.quests_claimed
    WHEN 'quests_200' THEN v_metrics.quests_claimed
    WHEN 'sdm_5'    THEN v_metrics.super_dm_quests
    WHEN 'xp_1000'  THEN GREATEST(v_metrics.total_xp, v_profile_xp)
    WHEN 'xp_10000' THEN GREATEST(v_metrics.total_xp, v_profile_xp)
    WHEN 'likes_5'    THEN v_metrics.likes_quests
    WHEN 'likes_25'   THEN v_metrics.likes_quests
    WHEN 'follows_5'  THEN v_metrics.follows_quests
    WHEN 'follows_25' THEN v_metrics.follows_quests
    WHEN 'saves_5'    THEN v_metrics.saves_quests
    WHEN 'saves_25'   THEN v_metrics.saves_quests
    WHEN 'comments_5' THEN v_metrics.comments_quests
    WHEN 'comments_25' THEN v_metrics.comments_quests
    WHEN 'polls_5' THEN v_metrics.polls_quests
    WHEN 'gifts_3' THEN v_metrics.gifts_quests
    WHEN 'gifts_10' THEN v_metrics.gifts_quests
    WHEN 'comm_join_1'    THEN v_metrics.communities_joined
    WHEN 'comm_join_5'    THEN v_metrics.communities_joined
    WHEN 'comm_topics_3'  THEN v_metrics.community_topics
    WHEN 'comm_topics_25' THEN v_metrics.community_topics
    WHEN 'play_pub_1'    THEN v_metrics.play_publishes
    WHEN 'play_pub_10'   THEN v_metrics.play_publishes
    WHEN 'play_views_1k' THEN v_metrics.play_views_total
    WHEN 'chat_50' THEN v_metrics.chat_messages
    WHEN 'chat_500' THEN v_metrics.chat_messages
    WHEN 'rooms_join_3'  THEN v_metrics.rooms_joined
    WHEN 'rooms_msgs_25' THEN v_metrics.rooms_messages
    WHEN 'match_1'  THEN v_metrics.matches_total
    WHEN 'match_10' THEN v_metrics.matches_total
    WHEN 'match_50' THEN v_metrics.matches_total
    WHEN 'rank_top100' THEN CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 100 THEN 1 ELSE 0 END
    WHEN 'rank_top10'  THEN CASE WHEN v_metrics.engagement_rank BETWEEN 1 AND 10  THEN 1 ELSE 0 END
    WHEN 'play_listen_streak_10' THEN COALESCE(v_play.listen_streak, 0)
    WHEN 'play_visit_streak_10'  THEN COALESCE(v_play.visit_streak_consec, 0)
    WHEN 'play_visit_30'         THEN COALESCE(v_play.visit_days_total, 0)
    ELSE 0
  END;

  v_current := COALESCE(v_metric_val, 0);
  eligible := v_current >= v_required AND v_required > 0;
  rare     := v_safe_xp >= 10000;

  SELECT EXISTS(SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id) INTO already_claimed;

  SELECT COALESCE(p.aura_xp,0), COALESCE(p.aura_level,1) INTO xp_total, level
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;

  IF already_claimed OR NOT eligible THEN
    awarded := false; RETURN NEXT; RETURN;
  END IF;

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

-- 3) RESET — varre TODOS os claims fraudulentos (cuja métrica server-side é
--    insuficiente HOJE). Para cada um: desconta XP, apaga claim, apaga rare
--    unlock e notificação correspondente. Atómico em transação.
DO $$
DECLARE
  c record;
  v_metric int;
  v_required int;
  v_metrics record;
  v_play record;
  v_profile_xp int;
  v_profile_level int;
  v_profile_streak int;
  v_total_clawback int;
  v_users uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR c IN
    SELECT ac.user_id, ac.profile_id, ac.achievement_id, ac.xp_awarded,
           r.required
      FROM public.oculto_aura_achievement_claims ac
      JOIN public.oculto_aura_achievement_rewards r ON r.achievement_id = ac.achievement_id
  LOOP
    -- Recalcula métrica do dono do claim
    SELECT COALESCE(p.aura_xp,0), COALESCE(p.aura_level,1), COALESCE(p.aura_streak_days,0)
      INTO v_profile_xp, v_profile_level, v_profile_streak
      FROM public.profiles p WHERE p.id = c.profile_id;

    -- Métrica autoritativa: usa só profile + valor já gravado no claim NÃO
    -- entra na decisão. Para o reset usamos os campos do próprio profile
    -- como proxy (suficiente para barrar xp_10000 em conta zerada).
    v_metric := CASE c.achievement_id
      WHEN 'lvl_5'    THEN v_profile_level
      WHEN 'lvl_10'   THEN v_profile_level
      WHEN 'lvl_20'   THEN v_profile_level
      WHEN 'lvl_50'   THEN v_profile_level
      WHEN 'streak_3'  THEN v_profile_streak
      WHEN 'streak_7'  THEN v_profile_streak
      WHEN 'streak_30' THEN v_profile_streak
      WHEN 'visits_15' THEN v_profile_streak
      WHEN 'visits_30' THEN v_profile_streak
      -- aura_xp aqui é APÓS o crédito do claim. Subtrai para checar.
      WHEN 'xp_1000'  THEN GREATEST(0, v_profile_xp - c.xp_awarded)
      WHEN 'xp_10000' THEN GREATEST(0, v_profile_xp - c.xp_awarded)
      ELSE NULL  -- demais métricas: deixa o claim em paz neste reset
    END;

    IF v_metric IS NOT NULL AND v_metric < c.required THEN
      -- 1) Desconta XP
      UPDATE public.profiles
         SET aura_xp    = GREATEST(0, COALESCE(aura_xp,0) - c.xp_awarded),
             aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) - c.xp_awarded))
       WHERE id = c.profile_id;

      -- 2) Remove claim
      DELETE FROM public.oculto_aura_achievement_claims
       WHERE user_id = c.user_id AND achievement_id = c.achievement_id;

      -- 3) Remove rare unlock (broadcast)
      DELETE FROM public.oculto_aura_rare_unlocks
       WHERE user_id = c.user_id AND achievement_id = c.achievement_id;

      -- 4) Remove notificação relacionada
      DELETE FROM public.notifications
       WHERE user_id = c.user_id
         AND (data->>'achievement_id') = c.achievement_id;

      v_users := array_append(v_users, c.user_id);
    END IF;
  END LOOP;

  RAISE NOTICE 'Anti-cheat reset: % claims fraudulentos revertidos', cardinality(v_users);
END $$;

COMMIT;

-- Verificação manual:
-- SELECT p.username, p.aura_xp, p.aura_level
--   FROM public.profiles p
--  WHERE p.username ILIKE 'sniltoncesar129%';
