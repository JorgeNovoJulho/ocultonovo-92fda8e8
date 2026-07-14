-- ============================================================
-- ANTIFRAUD LAYER — Score, Freeze & Admin Alerts
-- Idempotent. Run on EXTERNAL Supabase SQL Editor.
-- ============================================================

-- 1) Fraud score column on profiles (0-100, higher = riskier)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fraud_score numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fraud_frozen_until timestamptz,
  ADD COLUMN IF NOT EXISTS fraud_last_check timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_fraud_frozen
  ON public.profiles(fraud_frozen_until)
  WHERE fraud_frozen_until IS NOT NULL;

-- 2) Fraud events table (audit trail)
CREATE TABLE IF NOT EXISTS public.fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL, -- chargeback, refund_burst, multi_account_ip, velocity, manual_flag
  severity text NOT NULL DEFAULT 'low', -- low | medium | high | critical
  score_delta numeric(5,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fraud_events_user
  ON public.fraud_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_events_unresolved
  ON public.fraud_events(severity, created_at DESC)
  WHERE resolved = false;

ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fraud_events_admin_all ON public.fraud_events;
CREATE POLICY fraud_events_admin_all ON public.fraud_events
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS fraud_events_service ON public.fraud_events;
CREATE POLICY fraud_events_service ON public.fraud_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Admin alerts queue (used by frontend bell)
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL, -- fraud, financial, abuse, system
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text,
  ref_user_id uuid,
  ref_table text,
  ref_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread
  ON public.admin_alerts(created_at DESC) WHERE read = false;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_alerts_admin_all ON public.admin_alerts;
CREATE POLICY admin_alerts_admin_all ON public.admin_alerts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS admin_alerts_service ON public.admin_alerts;
CREATE POLICY admin_alerts_service ON public.admin_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Register fraud event RPC (service_role + admin)
CREATE OR REPLACE FUNCTION public.register_fraud_event(
  p_user_id uuid,
  p_event_type text,
  p_severity text DEFAULT 'low',
  p_score_delta numeric DEFAULT 5,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_new_score numeric(5,2);
  v_freeze_days int := 0;
BEGIN
  -- Only service_role or admin
  IF auth.role() <> 'service_role' AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.fraud_events(user_id, event_type, severity, score_delta, metadata)
  VALUES (p_user_id, p_event_type, p_severity, p_score_delta, p_metadata)
  RETURNING id INTO v_id;

  UPDATE public.profiles
     SET fraud_score = LEAST(100, COALESCE(fraud_score,0) + p_score_delta),
         fraud_last_check = now()
   WHERE id = p_user_id OR user_id = p_user_id
  RETURNING fraud_score INTO v_new_score;

  -- Auto-freeze thresholds
  IF v_new_score >= 80 THEN v_freeze_days := 30;
  ELSIF v_new_score >= 60 THEN v_freeze_days := 7;
  ELSIF v_new_score >= 40 THEN v_freeze_days := 1;
  END IF;

  IF v_freeze_days > 0 THEN
    UPDATE public.profiles
       SET fraud_frozen_until = now() + (v_freeze_days || ' days')::interval
     WHERE (id = p_user_id OR user_id = p_user_id)
       AND (fraud_frozen_until IS NULL OR fraud_frozen_until < now() + (v_freeze_days || ' days')::interval);
  END IF;

  -- Admin alert for medium+
  IF p_severity IN ('medium','high','critical') THEN
    INSERT INTO public.admin_alerts(alert_type, severity, title, body, ref_user_id, ref_table, ref_id)
    VALUES (
      'fraud',
      p_severity,
      'Fraude detectada: ' || p_event_type,
      'Score atual: ' || COALESCE(v_new_score::text,'0') || ' • Freeze: ' || v_freeze_days || 'd',
      p_user_id,
      'fraud_events',
      v_id
    );
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_fraud_event(uuid,text,text,numeric,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_fraud_event(uuid,text,text,numeric,jsonb) TO service_role, authenticated;

-- 5) Helper: is user frozen
CREATE OR REPLACE FUNCTION public.is_user_frozen(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
     WHERE (id = p_user_id OR user_id = p_user_id)
       AND fraud_frozen_until IS NOT NULL
       AND fraud_frozen_until > now()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_frozen(uuid) TO authenticated, service_role;

-- 6) Trigger: detect refund/chargeback velocity from payment_splits
CREATE OR REPLACE FUNCTION public.detect_payment_velocity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.status IN ('refunded','chargeback') THEN
    SELECT COUNT(*) INTO v_count
      FROM public.payment_splits
     WHERE buyer_id = NEW.buyer_id
       AND status IN ('refunded','chargeback')
       AND created_at > now() - interval '24 hours';

    IF v_count >= 3 THEN
      PERFORM public.register_fraud_event(
        NEW.buyer_id,
        'refund_burst',
        'high',
        25,
        jsonb_build_object('count_24h', v_count, 'split_id', NEW.id)
      );
    ELSIF v_count >= 2 THEN
      PERFORM public.register_fraud_event(
        NEW.buyer_id, 'refund_burst', 'medium', 10,
        jsonb_build_object('count_24h', v_count, 'split_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_payment_velocity ON public.payment_splits;
CREATE TRIGGER trg_detect_payment_velocity
AFTER INSERT OR UPDATE OF status ON public.payment_splits
FOR EACH ROW EXECUTE FUNCTION public.detect_payment_velocity();

NOTIFY pgrst, 'reload schema';
