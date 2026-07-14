
ALTER TABLE public.oculto_user_activity_logs
  ADD COLUMN IF NOT EXISTS is_alerted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_oculto_activity_risk
  ON public.oculto_user_activity_logs (risk_score DESC, created_at DESC)
  WHERE risk_score > 0;

-- ===== Daily trend =====
CREATE OR REPLACE FUNCTION public.fraud_daily_trend(p_days INTEGER DEFAULT 14)
RETURNS TABLE (day DATE, total_actions BIGINT, unique_users BIGINT, suspicious BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT date_trunc('day', created_at)::date AS day,
         COUNT(*)::bigint,
         COUNT(DISTINCT user_id)::bigint,
         COUNT(*) FILTER (WHERE risk_score >= 50)::bigint
  FROM public.oculto_user_activity_logs
  WHERE created_at > now() - (p_days || ' days')::interval
  GROUP BY 1 ORDER BY 1;
END $$;

-- ===== Top IPs =====
CREATE OR REPLACE FUNCTION public.fraud_top_ips(p_limit INTEGER DEFAULT 20, p_days INTEGER DEFAULT 7)
RETURNS TABLE (ip_address TEXT, distinct_users BIGINT, total_actions BIGINT, last_seen TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT l.ip_address,
         COUNT(DISTINCT l.user_id)::bigint,
         COUNT(*)::bigint,
         MAX(l.created_at)
  FROM public.oculto_user_activity_logs l
  WHERE l.created_at > now() - (p_days || ' days')::interval
    AND l.ip_address IS NOT NULL
  GROUP BY l.ip_address
  ORDER BY 2 DESC, 3 DESC
  LIMIT p_limit;
END $$;

-- ===== Top devices =====
CREATE OR REPLACE FUNCTION public.fraud_top_devices(p_limit INTEGER DEFAULT 20, p_days INTEGER DEFAULT 7)
RETURNS TABLE (device_id TEXT, distinct_users BIGINT, total_actions BIGINT, last_seen TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT l.device_id,
         COUNT(DISTINCT l.user_id)::bigint,
         COUNT(*)::bigint,
         MAX(l.created_at)
  FROM public.oculto_user_activity_logs l
  WHERE l.created_at > now() - (p_days || ' days')::interval
    AND l.device_id IS NOT NULL
  GROUP BY l.device_id
  ORDER BY 2 DESC, 3 DESC
  LIMIT p_limit;
END $$;

-- ===== Top actions =====
CREATE OR REPLACE FUNCTION public.fraud_top_actions(p_limit INTEGER DEFAULT 20, p_days INTEGER DEFAULT 7)
RETURNS TABLE (action_type TEXT, total BIGINT, unique_users BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT l.action_type, COUNT(*)::bigint, COUNT(DISTINCT l.user_id)::bigint
  FROM public.oculto_user_activity_logs l
  WHERE l.created_at > now() - (p_days || ' days')::interval
  GROUP BY l.action_type
  ORDER BY 2 DESC
  LIMIT p_limit;
END $$;

-- ===== Search logs =====
CREATE OR REPLACE FUNCTION public.fraud_search_logs(
  p_ip TEXT DEFAULT NULL,
  p_device TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_min_risk INTEGER DEFAULT 0,
  p_days INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (
  id UUID, user_id UUID, action_type TEXT, ip_address TEXT,
  device_id TEXT, user_agent TEXT, risk_score INTEGER,
  metadata JSONB, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;
  RETURN QUERY
  SELECT l.id, l.user_id, l.action_type, l.ip_address, l.device_id,
         l.user_agent, l.risk_score, l.metadata, l.created_at
  FROM public.oculto_user_activity_logs l
  WHERE l.created_at > now() - (p_days || ' days')::interval
    AND (p_ip IS NULL OR l.ip_address = p_ip)
    AND (p_device IS NULL OR l.device_id = p_device)
    AND (p_user_id IS NULL OR l.user_id = p_user_id)
    AND l.risk_score >= p_min_risk
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END $$;

GRANT EXECUTE ON FUNCTION public.fraud_daily_trend(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fraud_top_ips(INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fraud_top_devices(INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fraud_top_actions(INTEGER,INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fraud_search_logs(TEXT,TEXT,UUID,INTEGER,INTEGER,INTEGER) TO authenticated;
