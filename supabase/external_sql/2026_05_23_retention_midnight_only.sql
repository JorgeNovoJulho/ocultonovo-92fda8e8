-- =============================================================
-- RETENTION — travar avanço do próximo dia até 00:00 America/Sao_Paulo
-- Corrige o bug em que o dia seguinte aparecia assim que todas as missões
-- do dia atual eram resgatadas, antes da meia-noite.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =============================================================

DROP FUNCTION IF EXISTS public.retention_touch();
CREATE OR REPLACE FUNCTION public.retention_touch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  INSERT INTO public.oculto_retention_progress (user_id, last_active_at, retention_day, updated_at)
  VALUES (v_uid, now(), 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_active_at = now(),
        retention_day = LEAST(
          7,
          GREATEST(
            1,
            (
              (
                ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
                - ((public.oculto_retention_progress.first_seen_at AT TIME ZONE 'America/Sao_Paulo')::date)
              )::int + 1
            )
          )
        ),
        updated_at = now();
END $$;

GRANT EXECUTE ON FUNCTION public.retention_touch() TO authenticated;

NOTIFY pgrst, 'reload schema';