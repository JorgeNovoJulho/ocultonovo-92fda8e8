-- =====================================================
-- WAITLIST TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT DEFAULT 'signup',
  referral_code TEXT,
  priority_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'invited', 'converted', 'expired')),
  invited_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist(created_at DESC);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies using is_admin function
CREATE POLICY "Anyone can add to waitlist"
ON public.waitlist FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view waitlist"
ON public.waitlist FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update waitlist"
ON public.waitlist FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete from waitlist"
ON public.waitlist FOR DELETE
USING (is_admin(auth.uid()));

-- =====================================================
-- CAPACITY SETTINGS (using proper JSONB format)
-- =====================================================
INSERT INTO public.system_settings (key, value, description) VALUES
  ('max_users_limit', '"1000"'::jsonb, 'Limite maximo de usuarios cadastrados'),
  ('waitlist_enabled', '"false"'::jsonb, 'Ativar fila de espera quando atingir limite'),
  ('capacity_alert_90', '"false"'::jsonb, 'Notificar quando atingir 90%'),
  ('capacity_alert_95', '"false"'::jsonb, 'Notificar quando atingir 95%'),
  ('capacity_alert_100', '"false"'::jsonb, 'Notificar quando atingir 100%'),
  ('capacity_webhook_url', 'null'::jsonb, 'URL para webhook de alertas de capacidade'),
  ('capacity_alert_email', 'null'::jsonb, 'Email para alertas de capacidade')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- CAPACITY METRICS RPC FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_capacity_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_users BIGINT;
  v_max_limit INTEGER;
  v_waitlist_enabled BOOLEAN;
  v_signups_last_hour BIGINT;
  v_signups_last_24h BIGINT;
  v_free_count BIGINT;
  v_premium_count BIGINT;
  v_vip_count BIGINT;
  v_waitlist_count BIGINT;
  v_percentage NUMERIC;
  v_hours_to_full NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_current_users
  FROM profiles
  WHERE is_seed = false OR is_seed IS NULL;
  
  SELECT COALESCE((value#>>'{}')::INTEGER, 1000) INTO v_max_limit
  FROM system_settings WHERE key = 'max_users_limit';
  
  SELECT COALESCE((value#>>'{}') = 'true', false) INTO v_waitlist_enabled
  FROM system_settings WHERE key = 'waitlist_enabled';
  
  SELECT COUNT(*) INTO v_signups_last_hour
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND created_at >= now() - INTERVAL '1 hour';
  
  SELECT COUNT(*) INTO v_signups_last_24h
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND created_at >= now() - INTERVAL '24 hours';
  
  SELECT COUNT(*) INTO v_free_count
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND COALESCE(plan_type, 'free') = 'free';
  
  SELECT COUNT(*) INTO v_premium_count
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND plan_type = 'premium';
  
  SELECT COUNT(*) INTO v_vip_count
  FROM profiles
  WHERE (is_seed = false OR is_seed IS NULL)
    AND plan_type = 'vip';
  
  SELECT COUNT(*) INTO v_waitlist_count
  FROM waitlist WHERE status = 'waiting';
  
  v_percentage := CASE WHEN v_max_limit > 0 
    THEN ROUND((v_current_users::NUMERIC / v_max_limit) * 100, 2)
    ELSE 0 
  END;
  
  IF v_signups_last_hour > 0 AND v_current_users < v_max_limit THEN
    v_hours_to_full := ROUND((v_max_limit - v_current_users)::NUMERIC / v_signups_last_hour, 1);
  ELSE
    v_hours_to_full := NULL;
  END IF;
  
  RETURN jsonb_build_object(
    'current_users', v_current_users,
    'max_limit', v_max_limit,
    'percentage', v_percentage,
    'waitlist_enabled', v_waitlist_enabled,
    'waitlist_count', v_waitlist_count,
    'signups_last_hour', v_signups_last_hour,
    'signups_last_24h', v_signups_last_24h,
    'hours_to_full', v_hours_to_full,
    'plan_distribution', jsonb_build_object(
      'free', v_free_count,
      'premium', v_premium_count,
      'vip', v_vip_count
    ),
    'estimated_mrr', (v_premium_count * 29.90) + (v_vip_count * 49.90)
  );
END;
$$;

-- =====================================================
-- ADD TO WAITLIST FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION public.add_to_waitlist(p_email TEXT, p_name TEXT DEFAULT NULL, p_source TEXT DEFAULT 'signup')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_position INTEGER;
  v_existing RECORD;
BEGIN
  SELECT * INTO v_existing FROM waitlist WHERE email = LOWER(TRIM(p_email));
  
  IF v_existing.id IS NOT NULL THEN
    SELECT COUNT(*) + 1 INTO v_position
    FROM waitlist
    WHERE status = 'waiting'
      AND created_at < v_existing.created_at;
    
    RETURN jsonb_build_object(
      'success', true,
      'already_registered', true,
      'position', v_position,
      'id', v_existing.id
    );
  END IF;
  
  INSERT INTO waitlist (email, name, source)
  VALUES (LOWER(TRIM(p_email)), p_name, p_source)
  RETURNING id INTO v_id;
  
  SELECT COUNT(*) INTO v_position
  FROM waitlist WHERE status = 'waiting';
  
  RETURN jsonb_build_object(
    'success', true,
    'already_registered', false,
    'position', v_position,
    'id', v_id
  );
END;
$$;

-- =====================================================
-- CAPACITY ALERT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_capacity_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_users BIGINT;
  v_max_limit INTEGER;
  v_percentage NUMERIC;
  v_alert_90 BOOLEAN;
  v_alert_95 BOOLEAN;
  v_alert_100 BOOLEAN;
BEGIN
  IF NEW.is_seed = true THEN
    RETURN NEW;
  END IF;
  
  SELECT COUNT(*) INTO v_current_users
  FROM profiles WHERE is_seed = false OR is_seed IS NULL;
  
  SELECT COALESCE((value#>>'{}')::INTEGER, 1000) INTO v_max_limit
  FROM system_settings WHERE key = 'max_users_limit';
  
  SELECT COALESCE((value#>>'{}') = 'true', false) INTO v_alert_90
  FROM system_settings WHERE key = 'capacity_alert_90';
  
  SELECT COALESCE((value#>>'{}') = 'true', false) INTO v_alert_95
  FROM system_settings WHERE key = 'capacity_alert_95';
  
  SELECT COALESCE((value#>>'{}') = 'true', false) INTO v_alert_100
  FROM system_settings WHERE key = 'capacity_alert_100';
  
  v_percentage := (v_current_users::NUMERIC / v_max_limit) * 100;
  
  IF v_percentage >= 100 AND v_alert_100 THEN
    INSERT INTO admin_notifications (type, title, body, data)
    VALUES (
      'capacity_full',
      '🚨 LIMITE ATINGIDO!',
      'A plataforma atingiu 100% da capacidade (' || v_current_users || '/' || v_max_limit || ' usuarios)',
      jsonb_build_object('percentage', 100, 'current', v_current_users, 'limit', v_max_limit)
    );
  ELSIF v_percentage >= 95 AND v_percentage < 100 AND v_alert_95 THEN
    IF NOT EXISTS (
      SELECT 1 FROM admin_notifications 
      WHERE type = 'capacity_warning' 
        AND (data->>'percentage')::INTEGER = 95
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO admin_notifications (type, title, body, data)
      VALUES (
        'capacity_warning',
        '⚠️ Capacidade em 95%',
        'A plataforma esta quase cheia: ' || v_current_users || '/' || v_max_limit || ' usuarios',
        jsonb_build_object('percentage', 95, 'current', v_current_users, 'limit', v_max_limit)
      );
    END IF;
  ELSIF v_percentage >= 90 AND v_percentage < 95 AND v_alert_90 THEN
    IF NOT EXISTS (
      SELECT 1 FROM admin_notifications 
      WHERE type = 'capacity_warning' 
        AND (data->>'percentage')::INTEGER = 90
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
      INSERT INTO admin_notifications (type, title, body, data)
      VALUES (
        'capacity_warning',
        '📊 Capacidade em 90%',
        'A plataforma esta se aproximando do limite: ' || v_current_users || '/' || v_max_limit || ' usuarios',
        jsonb_build_object('percentage', 90, 'current', v_current_users, 'limit', v_max_limit)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_capacity_on_signup ON public.profiles;
CREATE TRIGGER trigger_check_capacity_on_signup
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_capacity_on_signup();

ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;