
-- Fix max_users_limit value: remove the extra quotes (stored as "10000" string instead of 10000 number)
UPDATE system_settings 
SET value = '10000'::jsonb 
WHERE key = 'max_users_limit';

-- Also fix the get_capacity_metrics function to handle both string and number values safely
CREATE OR REPLACE FUNCTION public.get_capacity_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_raw_value TEXT;
BEGIN
  SELECT COUNT(*) INTO v_current_users
  FROM profiles
  WHERE is_seed = false OR is_seed IS NULL;
  
  -- Safely extract integer from jsonb (handles both number and string)
  SELECT value::text INTO v_raw_value
  FROM system_settings WHERE key = 'max_users_limit';
  
  v_max_limit := COALESCE(
    regexp_replace(COALESCE(v_raw_value, '1000'), '[^0-9]', '', 'g')::INTEGER,
    1000
  );
  
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
