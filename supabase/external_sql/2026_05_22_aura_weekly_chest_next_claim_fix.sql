-- =====================================================================
-- Fix: aura_weekly_chest_status — next_claim_at correto p/ quem já abriu
-- Calcula a próxima segunda-feira 00:00 em America/Sao_Paulo,
-- convertendo de volta para timestamptz (UTC).
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(
  week_key      text,
  claimed       boolean,
  claimed_at    timestamptz,
  next_claim_at timestamptz,
  level         int,
  xp_preview    int,
  super_dm_preview int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wk text := public.aura_current_week_key();
  v_row record;
  v_level int;
  v_xp_preview int;
  v_sdm_preview int;
  v_sp_now      timestamp;       -- "agora" no relógio de SP (sem tz)
  v_sp_monday   timestamp;       -- próxima segunda 00:00 no relógio de SP
  v_next_utc    timestamptz;     -- mesma instância, convertida para UTC
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT aura_level INTO v_level FROM public.profiles WHERE user_id = v_uid;
  v_level := COALESCE(v_level, 1);

  -- recompensa: XP base 50 + 25 por nível (cap 500); Super DM grátis por nível
  v_xp_preview  := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm_preview := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  SELECT * INTO v_row FROM public.oculto_aura_weekly_chests
   WHERE user_id = v_uid AND week_key = v_wk
   ORDER BY claimed_at DESC LIMIT 1;

  -- Calcular próxima segunda-feira 00:00 em SP, e converter p/ UTC.
  v_sp_now    := (now() AT TIME ZONE 'America/Sao_Paulo');
  -- date_trunc('week', ts) -> segunda 00:00 da semana corrente (ISO)
  v_sp_monday := date_trunc('week', v_sp_now) + interval '7 days';
  v_next_utc  := (v_sp_monday AT TIME ZONE 'America/Sao_Paulo');

  week_key      := v_wk;
  claimed       := v_row.id IS NOT NULL;
  claimed_at    := v_row.claimed_at;
  next_claim_at := CASE
    WHEN v_row.id IS NULL THEN now()
    ELSE v_next_utc
  END;
  level         := v_level;
  xp_preview    := v_xp_preview;
  super_dm_preview := v_sdm_preview;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
NOTIFY pgrst, 'reload schema';
