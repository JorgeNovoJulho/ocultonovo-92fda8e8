-- =============================================================
-- RETENTION — Bônus de 1000 XP ao completar o ciclo de 7 dias
-- Regra: só recebe o bônus se TODAS as missões ativas dos dias 1..7
-- foram CONCLUÍDAS E RESGATADAS pelo usuário (sem pular nenhum dia).
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =============================================================

-- 1) Coluna para registrar quando o bônus do ciclo atual foi concedido.
--    Quando o usuário inicia um novo ciclo (reset de first_seen_at ou
--    retention_day volta a 1), esse campo deve ser zerado pela lógica
--    de retention_touch — mas no caso atual o ciclo é cumulativo, então
--    basta garantir que o bônus seja concedido UMA vez por ciclo.
ALTER TABLE public.oculto_retention_progress
  ADD COLUMN IF NOT EXISTS cycle_bonus_awarded_at timestamptz NULL;

-- 2) Substitui retention_mission_claim_xp para, ao final, verificar se o
--    usuário completou TODAS as missões ativas dos dias 1..7 e, em caso
--    afirmativo, conceder +1000 XP de bônus (uma única vez por ciclo).
DROP FUNCTION IF EXISTS public.retention_mission_claim_xp(text);
CREATE OR REPLACE FUNCTION public.retention_mission_claim_xp(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_xp        int;
  v_done      jsonb;
  v_claimed   jsonb;
  v_user_day  int;
  v_mult      int := 1;
  v_awarded   int;
  v_total_req int;
  v_total_clm int;
  v_bonus_at  timestamptz;
  v_bonus_xp  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT xp_reward INTO v_xp
    FROM public.oculto_retention_missions_config
    WHERE key = p_key AND active = true;
  IF v_xp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  INSERT INTO public.oculto_retention_progress (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(completed_missions,'[]'::jsonb),
         COALESCE(claimed_missions,'[]'::jsonb),
         COALESCE(retention_day,1),
         cycle_bonus_awarded_at
    INTO v_done, v_claimed, v_user_day, v_bonus_at
    FROM public.oculto_retention_progress WHERE user_id = v_uid;

  IF NOT (v_done ? p_key) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_completed');
  END IF;
  IF v_claimed ? p_key THEN
    RETURN jsonb_build_object('ok', true, 'already_claimed', true);
  END IF;

  IF COALESCE(v_user_day,1) >= 7 THEN v_mult := 2; END IF;
  v_awarded := v_xp * v_mult;

  UPDATE public.oculto_retention_progress
     SET claimed_missions = v_claimed || to_jsonb(p_key),
         last_active_at   = now(),
         updated_at       = now()
   WHERE user_id = v_uid;

  BEGIN
    PERFORM public.aura_award_xp(v_awarded, 'retention_mission_claim:' || p_key);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- ── Bônus de fim de ciclo (1000 XP) ──
  -- Só concede se: (a) usuário está no dia 7, (b) bônus ainda não foi
  -- concedido neste ciclo, (c) o total de missões ativas dos dias 1..7
  -- é igual ao total de missões resgatadas do usuário nesses mesmos dias.
  -- Se faltou QUALQUER missão (pulou dia ou deixou sem resgatar), não recebe.
  IF COALESCE(v_user_day,1) >= 7 AND v_bonus_at IS NULL THEN
    SELECT COUNT(*) INTO v_total_req
      FROM public.oculto_retention_missions_config
     WHERE active = true AND day BETWEEN 1 AND 7;

    SELECT COUNT(*) INTO v_total_clm
      FROM public.oculto_retention_missions_config m
     WHERE m.active = true
       AND m.day BETWEEN 1 AND 7
       AND ((v_claimed || to_jsonb(p_key)) ? m.key);

    IF v_total_req > 0 AND v_total_clm >= v_total_req THEN
      v_bonus_xp := 1000;
      UPDATE public.oculto_retention_progress
         SET cycle_bonus_awarded_at = now(),
             updated_at = now()
       WHERE user_id = v_uid;
      BEGIN
        PERFORM public.aura_award_xp(v_bonus_xp, 'retention_cycle_complete_bonus');
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'xp_awarded', v_awarded,
    'multiplier', v_mult,
    'cycle_bonus_awarded', (v_bonus_xp > 0),
    'cycle_bonus_xp', v_bonus_xp
  );
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_claim_xp(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
