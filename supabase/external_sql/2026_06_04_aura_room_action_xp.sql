-- =============================================================================
-- "Salas Ocultas" — Entrar agora / Saiba mais → +10 XP por clique
-- Limite combinado de 60 XP/dia (BRT). Idempotente.
-- Rodar no Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_room_action_xp_log (
  user_id    uuid NOT NULL,
  brt_day    date NOT NULL,
  total_xp   integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brt_day)
);

ALTER TABLE public.oculto_aura_room_action_xp_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.oculto_aura_room_action_xp_log TO authenticated;
GRANT ALL    ON public.oculto_aura_room_action_xp_log TO service_role;

DROP POLICY IF EXISTS "owner reads room action log" ON public.oculto_aura_room_action_xp_log;
CREATE POLICY "owner reads room action log"
  ON public.oculto_aura_room_action_xp_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.aura_room_action_award_xp(text, integer);

CREATE OR REPLACE FUNCTION public.aura_room_action_award_xp(
  p_action text,
  p_amount integer DEFAULT 10
) RETURNS TABLE (ok boolean, awarded integer, total_today integer, daily_cap integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cap integer := 60;
  v_total integer := 0;
  v_award integer := GREATEST(0, LEAST(COALESCE(p_amount, 10), 60));
  v_remaining integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, v_cap; RETURN;
  END IF;

  INSERT INTO public.oculto_aura_room_action_xp_log (user_id, brt_day, total_xp)
  VALUES (v_uid, v_day, 0)
  ON CONFLICT (user_id, brt_day) DO NOTHING;

  SELECT total_xp INTO v_total
    FROM public.oculto_aura_room_action_xp_log
   WHERE user_id = v_uid AND brt_day = v_day
   FOR UPDATE;

  v_remaining := v_cap - v_total;
  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT false, 0, v_total, v_cap; RETURN;
  END IF;

  v_award := LEAST(v_award, v_remaining);

  UPDATE public.oculto_aura_room_action_xp_log
     SET total_xp = total_xp + v_award,
         updated_at = now()
   WHERE user_id = v_uid AND brt_day = v_day;

  v_total := v_total + v_award;

  BEGIN
    PERFORM public.aura_award_xp(v_award, 'room_action:' || COALESCE(p_action, 'misc'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN QUERY SELECT true, v_award, v_total, v_cap;
END;
$$;

DO $$
BEGIN
  BEGIN EXECUTE 'ALTER FUNCTION public.aura_room_action_award_xp(text, integer) OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

REVOKE ALL ON FUNCTION public.aura_room_action_award_xp(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_room_action_award_xp(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
