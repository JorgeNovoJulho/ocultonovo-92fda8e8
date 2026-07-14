-- =====================================================================
-- Aura Match V3 — Presença Digital (passersby agregado, anônimo)
-- Reaproveita profile_visits. Retorna apenas counts agregados — NÃO revela quem.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_recent_passersby()
RETURNS TABLE(
  passersby_24h integer,
  passersby_1h integer,
  closest_minutes_ago integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_target_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT id INTO v_target_pid FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_target_pid IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE pv.created_at > now() - interval '24 hours')::int AS passersby_24h,
    COUNT(*) FILTER (WHERE pv.created_at > now() - interval '1 hour')::int   AS passersby_1h,
    COALESCE(EXTRACT(EPOCH FROM (now() - MAX(pv.created_at)))::int / 60, 999999)::int AS closest_minutes_ago
  FROM public.profile_visits pv
  WHERE pv.profile_id = v_target_pid
    AND pv.created_at > now() - interval '24 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_recent_passersby() TO authenticated;

NOTIFY pgrst, 'reload schema';
