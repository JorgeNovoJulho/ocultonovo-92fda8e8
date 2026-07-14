-- Etapa A: RPCs para detectar bursts de atividade (mensagens, checkouts) por usuário em janela curta

CREATE OR REPLACE FUNCTION public.fraud_burst_activity(
  p_action text,
  p_window_minutes int DEFAULT 5,
  p_min_count int DEFAULT 20,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  user_id uuid,
  username text,
  action text,
  event_count bigint,
  first_event timestamptz,
  last_event timestamptz,
  unique_ips bigint,
  unique_devices bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    l.user_id,
    p.username,
    l.action,
    COUNT(*) AS event_count,
    MIN(l.created_at) AS first_event,
    MAX(l.created_at) AS last_event,
    COUNT(DISTINCT l.ip_address) AS unique_ips,
    COUNT(DISTINCT l.device_id) AS unique_devices
  FROM public.oculto_user_activity_logs l
  LEFT JOIN public.profiles p ON p.user_id = l.user_id OR p.id = l.user_id
  WHERE l.action = p_action
    AND l.created_at > now() - (p_window_minutes || ' minutes')::interval
    AND l.user_id IS NOT NULL
  GROUP BY l.user_id, p.username, l.action
  HAVING COUNT(*) >= p_min_count
  ORDER BY event_count DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.fraud_burst_activity(text, int, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fraud_burst_activity(text, int, int, int) TO authenticated;