CREATE OR REPLACE FUNCTION public.detect_fraud_patterns(p_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_multi_ip       JSONB;
  v_burst          JSONB;
  v_repeat         JSONB;
  v_payment_burst  JSONB;
  v_flagged_count  INT := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied: admin required';
  END IF;

  -- 1) Múltiplas contas no mesmo IP
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

  -- 2) Rajadas gerais
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_burst FROM (
    SELECT user_id, date_trunc('minute', created_at) AS minute, COUNT(*) AS actions
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '24 hours'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    GROUP BY user_id, date_trunc('minute', created_at)
    HAVING COUNT(*) > 30
    ORDER BY actions DESC LIMIT 50
  ) t;

  -- 3) Repetitivo
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_repeat FROM (
    SELECT user_id, action_type, COUNT(*) AS times
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '1 hour'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    GROUP BY user_id, action_type
    HAVING COUNT(*) > 50
    ORDER BY times DESC LIMIT 50
  ) t;

  -- 4) NOVO: Burst de pagamentos (5+ checkouts/hora)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_payment_burst FROM (
    SELECT user_id, COUNT(*) AS attempts,
           MIN(created_at) AS first_attempt, MAX(created_at) AS last_attempt
    FROM public.oculto_user_activity_logs
    WHERE created_at > now() - INTERVAL '1 hour'
      AND action_type IN ('payment_init','checkout_started','pix_generated')
      AND user_id IS NOT NULL
      AND (p_user_id IS NULL OR user_id = p_user_id)
    GROUP BY user_id
    HAVING COUNT(*) >= 5
    ORDER BY attempts DESC LIMIT 50
  ) t;

  -- 5) Auto-flag: marca como suspeito quem tem burst de pagamento
  IF v_payment_burst IS NOT NULL AND jsonb_array_length(v_payment_burst) > 0 THEN
    WITH flagged AS (
      UPDATE public.profiles
      SET is_suspicious_flagged = true
      WHERE (id IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_payment_burst) elem)
         OR user_id IN (SELECT (elem->>'user_id')::uuid FROM jsonb_array_elements(v_payment_burst) elem))
        AND COALESCE(is_suspicious_flagged, false) = false
      RETURNING 1
    )
    SELECT count(*) INTO v_flagged_count FROM flagged;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'multi_account_ip', v_multi_ip,
    'action_bursts', v_burst,
    'repetitive_behavior', v_repeat,
    'payment_burst', v_payment_burst,
    'auto_flagged_count', v_flagged_count
  );
END $function$;