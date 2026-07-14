-- =====================================================================
-- Aura Match — Diversificação das Missões Diárias
-- Substitui aura_ensure_daily_quests para sortear 4 quests/dia de um pool
-- determinístico por (user_id, dia). Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_ensure_daily_quests()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_seed  bigint;
  v_pool  jsonb := jsonb_build_array(
    jsonb_build_object('key','visit_aura',       'target',1, 'xp',15),
    jsonb_build_object('key','tap_3_auras',      'target',3, 'xp',25),
    jsonb_build_object('key','send_super_dm',    'target',1, 'xp',40),
    jsonb_build_object('key','resonance_3',      'target',3, 'xp',35),
    jsonb_build_object('key','visit_room',       'target',1, 'xp',20),
    jsonb_build_object('key','send_echo',        'target',1, 'xp',15),
    jsonb_build_object('key','view_5_profiles',  'target',5, 'xp',20),
    jsonb_build_object('key','tap_rare_aura',    'target',1, 'xp',35),
    jsonb_build_object('key','send_3_dms',       'target',3, 'xp',30),
    jsonb_build_object('key','join_storm',       'target',1, 'xp',30),
    jsonb_build_object('key','randomize_aura',   'target',1, 'xp',15),
    jsonb_build_object('key','send_gift',        'target',1, 'xp',35)
  );
  v_existing int;
  v_n int;
  v_idx int;
  v_item jsonb;
  v_picked text[] := ARRAY[]::text[];
  v_target_count int := 4;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  -- Se o usuário já tem alguma missão hoje, não sorteia de novo (mantém estabilidade)
  SELECT count(*) INTO v_existing
    FROM public.oculto_aura_daily_quests
   WHERE user_id = v_uid AND day = v_today;
  IF v_existing > 0 THEN RETURN; END IF;

  -- Semente determinística por usuário + dia
  v_seed := abs(hashtextextended(v_uid::text || ':' || v_today::text, 0));
  v_n := jsonb_array_length(v_pool);

  -- Garante que 'visit_aura' (mais simples) sempre apareça como onboarding diário
  v_picked := array_append(v_picked, 'visit_aura');

  -- Sorteia mais (v_target_count - 1) quests distintas do pool
  FOR i IN 1..(v_n * 3) LOOP
    EXIT WHEN array_length(v_picked, 1) >= v_target_count;
    v_idx := ((v_seed + i * 7919) % v_n)::int;  -- offset com primo
    v_item := v_pool -> v_idx;
    IF NOT ((v_item ->> 'key') = ANY (v_picked)) THEN
      v_picked := array_append(v_picked, v_item ->> 'key');
    END IF;
  END LOOP;

  -- Insere as escolhidas
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
NOTIFY pgrst, 'reload schema';
