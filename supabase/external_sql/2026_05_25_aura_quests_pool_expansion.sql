-- =====================================================================
-- Aura Match — Expansão do Pool de Missões Diárias + Novas Métricas
-- - Adiciona 10 novas missões diárias explorando funcionalidades reais
--   do app (likes, follows, saves, votos, comentários, visitas).
-- - Aumenta o sorteio diário de 4 para 5 quests (mais variedade por dia).
-- - Expande aura_achievements_metrics com contadores por chave de missão
--   para alimentar novas conquistas no front.
-- Idempotente: pode rodar várias vezes sem efeitos colaterais.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_ensure_daily_quests()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seed  bigint;
  v_pool  jsonb := jsonb_build_array(
    -- Núcleo Aura (já existentes)
    jsonb_build_object('key','visit_aura',         'target',1, 'xp',15),
    jsonb_build_object('key','tap_3_auras',        'target',3, 'xp',25),
    jsonb_build_object('key','send_super_dm',      'target',1, 'xp',40),
    jsonb_build_object('key','resonance_3',        'target',3, 'xp',35),
    jsonb_build_object('key','visit_room',         'target',1, 'xp',20),
    jsonb_build_object('key','send_echo',          'target',1, 'xp',15),
    jsonb_build_object('key','view_5_profiles',    'target',5, 'xp',20),
    jsonb_build_object('key','tap_rare_aura',      'target',1, 'xp',35),
    jsonb_build_object('key','send_3_dms',         'target',3, 'xp',30),
    jsonb_build_object('key','join_storm',         'target',1, 'xp',30),
    jsonb_build_object('key','randomize_aura',     'target',1, 'xp',15),
    jsonb_build_object('key','send_gift',          'target',1, 'xp',35),
    -- Novas missões — exploram o ecossistema social do app
    jsonb_build_object('key','follow_profile',     'target',1, 'xp',20),
    jsonb_build_object('key','like_post',          'target',3, 'xp',25),
    jsonb_build_object('key','save_post',          'target',2, 'xp',20),
    jsonb_build_object('key','vote_poll',          'target',1, 'xp',20),
    jsonb_build_object('key','comment_post',       'target',1, 'xp',25),
    jsonb_build_object('key','visit_notifications','target',1, 'xp',10),
    jsonb_build_object('key','visit_vitrine_vip',  'target',1, 'xp',15),
    jsonb_build_object('key','visit_canal_vip',    'target',1, 'xp',15)
  );
  v_existing int;
  v_n int;
  v_idx int;
  v_item jsonb;
  v_picked text[] := ARRAY[]::text[];
  v_target_count int := 5;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_existing
    FROM public.oculto_aura_daily_quests
   WHERE user_id = v_uid AND day = v_today;
  IF v_existing > 0 THEN RETURN; END IF;

  v_seed := abs(hashtextextended(v_uid::text || ':' || v_today::text, 0));
  v_n := jsonb_array_length(v_pool);

  -- visit_aura sempre presente (onboarding diário)
  v_picked := array_append(v_picked, 'visit_aura');

  FOR i IN 1..(v_n * 4) LOOP
    EXIT WHEN array_length(v_picked, 1) >= v_target_count;
    v_idx := ((v_seed + i * 7919) % v_n)::int;
    v_item := v_pool -> v_idx;
    IF NOT ((v_item ->> 'key') = ANY (v_picked)) THEN
      v_picked := array_append(v_picked, v_item ->> 'key');
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT j FROM jsonb_array_elements(v_pool) j
     WHERE (j ->> 'key') = ANY (v_picked)
  LOOP
    INSERT INTO public.oculto_aura_daily_quests
      (user_id, quest_key, day, progress, target, xp_reward)
    VALUES
      (v_uid,
       v_item ->> 'key',
       v_today,
       0,
       (v_item ->> 'target')::int,
       (v_item ->> 'xp')::int)
    ON CONFLICT (user_id, quest_key, day) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_ensure_daily_quests() TO authenticated;

-- =====================================================================
-- Métricas expandidas — alimenta o catálogo de conquistas no front.
-- Adiciona contadores granulares por chave de missão resgatada.
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT aura_xp          FROM public.profiles WHERE user_id = v_uid), 0),
    COALESCE((SELECT aura_level       FROM public.profiles WHERE user_id = v_uid), 1),
    COALESCE((SELECT aura_streak_days FROM public.profiles WHERE user_id = v_uid), 0),
    COALESCE((SELECT COUNT(DISTINCT day)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid), 0),
    COALESCE((SELECT COUNT(*)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'send_super_dm' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'like_post' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'follow_profile' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'save_post' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'comment_post' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'vote_poll' AND claimed_at IS NOT NULL), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND quest_key = 'send_gift' AND claimed_at IS NOT NULL), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;

NOTIFY pgrst, 'reload schema';
