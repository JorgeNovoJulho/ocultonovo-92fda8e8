-- =============================================================================
-- "Mostrar conteúdo adulto" → +1 XP por clique, limite 30 XP/dia (BRT).
-- Idempotente. Rodar no Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_reveal_safe_log (
  user_id   uuid NOT NULL,
  brt_day   date NOT NULL,
  count     integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brt_day)
);

ALTER TABLE public.oculto_aura_reveal_safe_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.oculto_aura_reveal_safe_log TO authenticated;
GRANT ALL    ON public.oculto_aura_reveal_safe_log TO service_role;

DROP POLICY IF EXISTS "owner reads reveal log" ON public.oculto_aura_reveal_safe_log;
CREATE POLICY "owner reads reveal log"
  ON public.oculto_aura_reveal_safe_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RPC pública chamada pelo botão "Mostrar"
DROP FUNCTION IF EXISTS public.aura_reveal_safe_award_xp();

CREATE OR REPLACE FUNCTION public.aura_reveal_safe_award_xp()
RETURNS TABLE (ok boolean, awarded integer, total_today integer, daily_cap integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_day   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_cap   integer := 30;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, v_cap; RETURN;
  END IF;

  INSERT INTO public.oculto_aura_reveal_safe_log (user_id, brt_day, count)
  VALUES (v_uid, v_day, 0)
  ON CONFLICT (user_id, brt_day) DO NOTHING;

  SELECT count INTO v_count
    FROM public.oculto_aura_reveal_safe_log
   WHERE user_id = v_uid AND brt_day = v_day
   FOR UPDATE;

  IF v_count >= v_cap THEN
    RETURN QUERY SELECT false, 0, v_count, v_cap; RETURN;
  END IF;

  UPDATE public.oculto_aura_reveal_safe_log
     SET count = count + 1,
         updated_at = now()
   WHERE user_id = v_uid AND brt_day = v_day;

  v_count := v_count + 1;

  -- Concede 1 XP via engine de Aura existente
  BEGIN
    PERFORM public.aura_award_xp(1, 'reveal_safe_content');
  EXCEPTION WHEN OTHERS THEN
    -- se aura_award_xp falhar, ainda retornamos sucesso para não bloquear o reveal
    NULL;
  END;

  RETURN QUERY SELECT true, 1, v_count, v_cap;
END;
$$;

-- BYPASSRLS como dono (segunda camada)
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER FUNCTION public.aura_reveal_safe_award_xp() OWNER TO postgres';
  EXCEPTION WHEN OTHERS THEN NULL; END;
END$$;

REVOKE ALL ON FUNCTION public.aura_reveal_safe_award_xp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_reveal_safe_award_xp() TO authenticated;

NOTIFY pgrst, 'reload schema';
