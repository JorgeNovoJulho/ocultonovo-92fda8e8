-- Aura Match v2 — Bloco H: Streaks Diários
CREATE TABLE IF NOT EXISTS public.oculto_aura_streaks (
  user_id uuid PRIMARY KEY,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  last_check_in date,
  freezes_used_week int NOT NULL DEFAULT 0,
  freeze_week_key text,
  total_check_ins int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oculto_aura_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "streaks_select_own" ON public.oculto_aura_streaks;
CREATE POLICY "streaks_select_own" ON public.oculto_aura_streaks FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.aura_streak_status()
RETURNS TABLE(current_streak int, longest_streak int, last_check_in date, can_check_in_today boolean, today_xp_preview int, freezes_left int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_row record; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_wk text := to_char(v_today, 'IYYY-IW'); v_freezes int;
BEGIN
  SELECT * INTO v_row FROM public.oculto_aura_streaks WHERE user_id = v_uid;
  v_freezes := CASE WHEN v_row.freeze_week_key = v_wk THEN GREATEST(0, 1 - COALESCE(v_row.freezes_used_week, 0)) ELSE 1 END;
  RETURN QUERY SELECT
    COALESCE(v_row.current_streak, 0),
    COALESCE(v_row.longest_streak, 0),
    v_row.last_check_in,
    (v_row.last_check_in IS NULL OR v_row.last_check_in < v_today),
    LEAST(200, 10 * (COALESCE(v_row.current_streak, 0) + 1)),
    v_freezes;
END; $$;

CREATE OR REPLACE FUNCTION public.aura_streak_check_in()
RETURNS TABLE(ok boolean, message text, current_streak int, xp_awarded int, level int, level_up boolean, freeze_used boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_row record;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_wk text := to_char(v_today, 'IYYY-IW');
  v_new_streak int; v_xp int; v_old_lvl int; v_new_lvl int; v_freeze boolean := false;
  v_diff int;
BEGIN
  SELECT * INTO v_row FROM public.oculto_aura_streaks WHERE user_id = v_uid FOR UPDATE;
  IF v_row.user_id IS NULL THEN
    INSERT INTO public.oculto_aura_streaks (user_id, current_streak, longest_streak, last_check_in, total_check_ins)
    VALUES (v_uid, 1, 1, v_today, 1);
    v_new_streak := 1;
  ELSE
    IF v_row.last_check_in = v_today THEN
      RETURN QUERY SELECT false, 'Você já garantiu o streak de hoje', v_row.current_streak, 0,
        (SELECT COALESCE(aura_level,1) FROM profiles WHERE user_id = v_uid), false, false;
      RETURN;
    END IF;
    v_diff := (v_today - v_row.last_check_in);
    IF v_diff = 1 THEN
      v_new_streak := v_row.current_streak + 1;
    ELSIF v_diff = 2 AND (v_row.freeze_week_key IS DISTINCT FROM v_wk OR COALESCE(v_row.freezes_used_week,0) < 1) THEN
      v_new_streak := v_row.current_streak + 1;
      v_freeze := true;
      UPDATE public.oculto_aura_streaks SET
        freezes_used_week = CASE WHEN freeze_week_key = v_wk THEN COALESCE(freezes_used_week,0) + 1 ELSE 1 END,
        freeze_week_key = v_wk
      WHERE user_id = v_uid;
    ELSE
      v_new_streak := 1;
    END IF;
    UPDATE public.oculto_aura_streaks SET
      current_streak = v_new_streak,
      longest_streak = GREATEST(longest_streak, v_new_streak),
      last_check_in = v_today,
      total_check_ins = total_check_ins + 1,
      updated_at = now()
    WHERE user_id = v_uid;
  END IF;

  v_xp := LEAST(200, 10 * v_new_streak);
  SELECT COALESCE(aura_level,1) INTO v_old_lvl FROM profiles WHERE user_id = v_uid;
  UPDATE profiles SET aura_xp = COALESCE(aura_xp,0) + v_xp,
    aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + v_xp)
    WHERE user_id = v_uid RETURNING aura_level INTO v_new_lvl;

  RETURN QUERY SELECT true,
    CASE WHEN v_freeze THEN 'Streak protegido com seu freeze semanal!' ELSE 'Check-in feito! Sequência atualizada.' END,
    v_new_streak, v_xp, COALESCE(v_new_lvl, v_old_lvl, 1), COALESCE(v_new_lvl > v_old_lvl, false), v_freeze;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_streak_status(), public.aura_streak_check_in() TO authenticated;
NOTIFY pgrst, 'reload schema';
