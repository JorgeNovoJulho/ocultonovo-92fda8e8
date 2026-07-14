-- =====================================================================
-- Aura Match v2 — Bloco B: Aura Evolutiva
-- Colunas em profiles:
--   aura_xp           int     XP acumulado
--   aura_level        int     nível derivado (1..)
--   aura_streak_days  int     dias consecutivos de visita ao Aura Match
--   aura_last_seen_at timestamptz  última visita registrada
-- RPCs:
--   aura_register_visit()  -> atualiza streak + concede XP diário
--   aura_award_xp(amount, reason)  -> concede XP por interação
--   aura_get_progress()    -> snapshot rápido do estado atual
-- Idempotente.
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp           integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aura_level        integer     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS aura_streak_days  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aura_last_seen_at timestamptz;

-- Curva de nível: nivel = floor(sqrt(xp / 50)) + 1   (suave; lvl 2=50xp, 3=200, 4=450, 5=800)
CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(p_xp, 0)::numeric / 50))::int + 1);
$$;

CREATE OR REPLACE FUNCTION public.aura_award_xp(p_amount integer, p_reason text DEFAULT NULL)
RETURNS TABLE(xp integer, level integer, level_up boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN;
  END IF;

  SELECT aura_level INTO v_old_level FROM public.profiles WHERE user_id = v_uid;
  IF v_old_level IS NULL THEN v_old_level := 1; END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, aura_xp + p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, aura_xp + p_amount))
   WHERE user_id = v_uid
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  xp := v_new_xp;
  level := v_new_level;
  level_up := v_new_level > v_old_level;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_register_visit()
RETURNS TABLE(streak_days integer, xp integer, level integer, level_up boolean, awarded_xp integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last date;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_new_streak int;
  v_award int := 0;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT (aura_last_seen_at at time zone 'America/Sao_Paulo')::date, aura_streak_days, aura_level
    INTO v_last, v_new_streak, v_old_level
    FROM public.profiles WHERE user_id = v_uid;

  IF v_old_level IS NULL THEN v_old_level := 1; END IF;
  IF v_new_streak IS NULL THEN v_new_streak := 0; END IF;

  IF v_last IS NULL OR v_last < v_today - 1 THEN
    v_new_streak := 1;
    v_award := 10;
  ELSIF v_last = v_today - 1 THEN
    v_new_streak := v_new_streak + 1;
    v_award := 10 + LEAST(v_new_streak, 7) * 2;  -- bônus por consistência (cap 24)
  ELSE
    -- já visitou hoje: nada de XP, só atualiza last_seen
    v_award := 0;
  END IF;

  UPDATE public.profiles
     SET aura_streak_days = v_new_streak,
         aura_last_seen_at = now(),
         aura_xp = GREATEST(0, aura_xp + v_award),
         aura_level = public.aura_level_from_xp(GREATEST(0, aura_xp + v_award))
   WHERE user_id = v_uid
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  streak_days := v_new_streak;
  xp := v_new_xp;
  level := v_new_level;
  level_up := v_new_level > v_old_level;
  awarded_xp := v_award;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_get_progress()
RETURNS TABLE(xp integer, level integer, streak_days integer, xp_to_next integer, xp_in_level integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp int; v_lvl int; v_streak int;
  v_floor int; v_next int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT aura_xp, aura_level, aura_streak_days INTO v_xp, v_lvl, v_streak
    FROM public.profiles WHERE user_id = v_uid;
  v_xp := COALESCE(v_xp, 0);
  v_lvl := COALESCE(v_lvl, 1);
  v_streak := COALESCE(v_streak, 0);
  v_floor := 50 * (v_lvl - 1) * (v_lvl - 1);          -- xp mínimo para o nível atual
  v_next  := 50 * v_lvl * v_lvl;                       -- xp mínimo para o próximo nível
  xp := v_xp;
  level := v_lvl;
  streak_days := v_streak;
  xp_in_level := GREATEST(0, v_xp - v_floor);
  xp_to_next  := GREATEST(1, v_next - v_floor);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_award_xp(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_register_visit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_get_progress() TO authenticated;

NOTIFY pgrst, 'reload schema';
