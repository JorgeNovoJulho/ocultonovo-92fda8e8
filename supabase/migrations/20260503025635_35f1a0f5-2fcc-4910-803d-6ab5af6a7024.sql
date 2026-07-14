
-- =========================================================
-- FRAUD DETECTION INFRASTRUCTURE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.oculto_user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action_type TEXT NOT NULL,
  ip_address TEXT,
  device_id TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  risk_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_activity_user_time ON public.oculto_user_activity_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_activity_ip_time   ON public.oculto_user_activity_logs (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_activity_device    ON public.oculto_user_activity_logs (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_activity_action    ON public.oculto_user_activity_logs (action_type, created_at DESC);

ALTER TABLE public.oculto_user_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Block all direct access activity_logs" ON public.oculto_user_activity_logs;
CREATE POLICY "Block all direct access activity_logs"
  ON public.oculto_user_activity_logs AS RESTRICTIVE
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Admins can read activity logs" ON public.oculto_user_activity_logs;
CREATE POLICY "Admins can read activity logs"
  ON public.oculto_user_activity_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------- Logger (SECURITY DEFINER, bypassa RLS RESTRICTIVE) ----------
CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_user_id UUID,
  p_action_type TEXT,
  p_ip TEXT DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.oculto_user_activity_logs(user_id, action_type, ip_address, device_id, user_agent, metadata)
  VALUES (p_user_id, p_action_type, p_ip, p_device_id, p_user_agent, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ---------- Detector de padrões suspeitos ----------
CREATE OR REPLACE FUNCTION public.detect_fraud_patterns(p_user_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_multi_ip JSONB;
  v_burst    JSONB;
  v_repeat   JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;

  -- 1) Múltiplas contas no mesmo IP (>3 user_ids distintos / 7d)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_multi_ip FROM (
    SELECT ip_address, COUNT(DISTINCT user_id) AS distinct_users,
           array_agg(DISTINCT user_id) AS user_ids
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '7 days'
      AND ip_address IS NOT NULL
      AND (p_user_id IS NULL OR user_id = p_user_id OR ip_address IN (
        SELECT DISTINCT ip_address FROM public.oculto_user_activity_logs WHERE user_id = p_user_id
      ))
    GROUP BY ip_address
    HAVING COUNT(DISTINCT user_id) > 3
    ORDER BY distinct_users DESC LIMIT 50
  ) t;

  -- 2) Rajadas: >30 ações em 1 minuto
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_burst FROM (
    SELECT user_id, date_trunc('minute', created_at) AS minute, COUNT(*) AS actions
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '24 hours'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    GROUP BY user_id, date_trunc('minute', created_at)
    HAVING COUNT(*) > 30
    ORDER BY actions DESC LIMIT 50
  ) t;

  -- 3) Comportamento repetitivo: mesma action_type >50x em 1h
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_repeat FROM (
    SELECT user_id, action_type, COUNT(*) AS times
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '1 hour'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    GROUP BY user_id, action_type
    HAVING COUNT(*) > 50
    ORDER BY times DESC LIMIT 50
  ) t;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'multi_account_ip', v_multi_ip,
    'action_bursts', v_burst,
    'repetitive_behavior', v_repeat
  );
END $$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(UUID,TEXT,TEXT,TEXT,TEXT,JSONB) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.detect_fraud_patterns(UUID) TO authenticated;
