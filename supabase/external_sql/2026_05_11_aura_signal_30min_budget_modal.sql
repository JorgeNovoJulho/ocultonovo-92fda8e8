-- =====================================================================
-- Aura Signal — janela de 30 min como ORÇAMENTO (só consome com modal aberto)
-- Hard expiry = 3 dias. Contador de pessoas únicas que interagiram.
-- =====================================================================

-- 1) Coluna de consumo + ajuste das settings
ALTER TABLE public.oculto_aura_signal_unlocks
  ADD COLUMN IF NOT EXISTS seconds_consumed integer NOT NULL DEFAULT 0;

UPDATE public.oculto_aura_settings
   SET value = to_jsonb(30), updated_at = now()
 WHERE key = 'aura_signal_reveal_window_minutes';

INSERT INTO public.oculto_aura_settings (key, value)
VALUES ('aura_signal_reveal_lifetime_days', to_jsonb(3))
ON CONFLICT (key) DO NOTHING;

-- 2) Recria unlock: hard expiry = 3 dias, consumed = 0
DROP FUNCTION IF EXISTS public.aura_unlock_signal(text);

CREATE OR REPLACE FUNCTION public.aura_unlock_signal(p_signal_kind text)
RETURNS TABLE(ok boolean, cost_xp integer, remaining_xp integer, expires_at timestamptz, seconds_left integer, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 100;
  v_minutes integer := 30;
  v_days integer := 3;
  v_balance integer := 0;
  v_existing record;
  v_budget_sec integer;
  v_remaining integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF COALESCE(trim(p_signal_kind), '') = '' THEN RAISE EXCEPTION 'signal required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_cost_xp';
  SELECT COALESCE((value)::int, 30) INTO v_minutes
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_window_minutes';
  SELECT COALESCE((value)::int, 3) INTO v_days
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_lifetime_days';

  v_budget_sec := COALESCE(v_minutes, 30) * 60;

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  -- Já tem unlock vivo (com saldo de tempo)?
  SELECT * INTO v_existing
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid
     AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
     AND u.seconds_consumed < v_budget_sec
   ORDER BY u.expires_at DESC LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_remaining := GREATEST(0, v_budget_sec - COALESCE(v_existing.seconds_consumed,0));
    ok := true; cost_xp := 0; remaining_xp := COALESCE(v_balance,0);
    expires_at := v_existing.expires_at; seconds_left := v_remaining;
    message := 'Já desbloqueado'; RETURN NEXT; RETURN;
  END IF;

  IF COALESCE(v_balance,0) < COALESCE(v_cost,100) THEN
    ok := false; cost_xp := COALESCE(v_cost,100); remaining_xp := COALESCE(v_balance,0);
    expires_at := NULL; seconds_left := 0; message := 'XP insuficiente';
    RETURN NEXT; RETURN;
  END IF;

  PERFORM public.aura_award_xp(-COALESCE(v_cost,100), 'signal_unlock:' || p_signal_kind);

  INSERT INTO public.oculto_aura_signal_unlocks (user_id, signal_kind, cost_xp, unlocked_at, expires_at, seconds_consumed)
  VALUES (v_uid, p_signal_kind, COALESCE(v_cost,100), now(),
          now() + make_interval(days => COALESCE(v_days,3)), 0);

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  ok := true; cost_xp := COALESCE(v_cost,100); remaining_xp := COALESCE(v_balance,0);
  expires_at := now() + make_interval(days => COALESCE(v_days,3));
  seconds_left := v_budget_sec; message := 'Desbloqueado';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_unlock_signal(text) TO authenticated;

-- 3) Recria status: seconds_left = budget - consumed; inclui actors_count
DROP FUNCTION IF EXISTS public.aura_signal_unlock_status(text);

CREATE OR REPLACE FUNCTION public.aura_signal_unlock_status(p_signal_kind text)
RETURNS TABLE(
  signal_kind text,
  reveal_cost_xp integer,
  balance_xp integer,
  unlocked boolean,
  seconds_left integer,
  history_days integer,
  budget_seconds integer,
  actors_count integer,
  expires_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer := 100;
  v_balance integer := 0;
  v_minutes integer := 30;
  v_days integer := 3;
  v_unlock record;
  v_budget_sec integer;
  v_remaining integer := 0;
  v_actors integer := 0;
  v_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 100) INTO v_cost
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_cost_xp';
  SELECT COALESCE((value)::int, 30) INTO v_minutes
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_window_minutes';
  SELECT COALESCE((value)::int, 3) INTO v_days
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_lifetime_days';

  v_budget_sec := COALESCE(v_minutes,30) * 60;

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  SELECT * INTO v_unlock
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
   ORDER BY u.expires_at DESC LIMIT 1;

  IF v_unlock.id IS NOT NULL THEN
    v_remaining := GREATEST(0, v_budget_sec - COALESCE(v_unlock.seconds_consumed, 0));
  END IF;

  -- contador de pessoas únicas que interagiram nos últimos N dias
  IF p_signal_kind = 'attention' THEN
    SELECT count(DISTINCT a.sender_id)::int INTO v_actors
      FROM public.oculto_aura_attentions a
     WHERE a.target_id = v_uid
       AND a.created_at > now() - make_interval(days => COALESCE(v_days,3));
  ELSIF p_signal_kind = 'profile_view' THEN
    SELECT id INTO v_pid FROM public.profiles WHERE user_id = v_uid LIMIT 1;
    IF v_pid IS NOT NULL THEN
      SELECT count(DISTINCT pv.visitor_id)::int INTO v_actors
        FROM public.profile_visits pv
       WHERE pv.visited_id = v_pid
         AND pv.visited_at > now() - make_interval(days => COALESCE(v_days,3));
    END IF;
  END IF;

  signal_kind := p_signal_kind;
  reveal_cost_xp := COALESCE(v_cost,100);
  balance_xp := COALESCE(v_balance,0);
  unlocked := (v_unlock.id IS NOT NULL AND v_remaining > 0);
  seconds_left := v_remaining;
  history_days := COALESCE(v_days,3);
  budget_seconds := v_budget_sec;
  actors_count := COALESCE(v_actors,0);
  expires_at := v_unlock.expires_at;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_signal_unlock_status(text) TO authenticated;

-- 4) Consume time (modal aberto envia heartbeat). Retorna saldo restante.
DROP FUNCTION IF EXISTS public.aura_signal_consume_time(text, integer);

CREATE OR REPLACE FUNCTION public.aura_signal_consume_time(p_signal_kind text, p_seconds integer)
RETURNS TABLE(seconds_left integer, exhausted boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_unlock record;
  v_minutes integer := 30;
  v_budget_sec integer;
  v_inc integer := GREATEST(0, LEAST(COALESCE(p_seconds,0), 120));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT COALESCE((value)::int, 30) INTO v_minutes
    FROM public.oculto_aura_settings WHERE key = 'aura_signal_reveal_window_minutes';
  v_budget_sec := COALESCE(v_minutes,30) * 60;

  SELECT * INTO v_unlock
    FROM public.oculto_aura_signal_unlocks u
   WHERE u.user_id = v_uid AND u.signal_kind = p_signal_kind
     AND u.expires_at > now()
   ORDER BY u.expires_at DESC LIMIT 1;

  IF v_unlock.id IS NULL THEN
    seconds_left := 0; exhausted := true; RETURN NEXT; RETURN;
  END IF;

  UPDATE public.oculto_aura_signal_unlocks
     SET seconds_consumed = LEAST(v_budget_sec, COALESCE(seconds_consumed,0) + v_inc)
   WHERE id = v_unlock.id;

  SELECT seconds_consumed INTO v_unlock.seconds_consumed
    FROM public.oculto_aura_signal_unlocks WHERE id = v_unlock.id;

  seconds_left := GREATEST(0, v_budget_sec - COALESCE(v_unlock.seconds_consumed,0));
  exhausted := (seconds_left = 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_signal_consume_time(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
