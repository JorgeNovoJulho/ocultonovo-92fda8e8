-- ============================================================================
-- BETA CONTROL — Guard backend
-- assert_platform_feature(key) → boolean
-- Para uso dentro de RPCs / edge functions (via supabase.rpc).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_platform_feature(p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.platform_runtime_settings;
BEGIN
  SELECT * INTO r FROM public.platform_runtime_settings ORDER BY created_at LIMIT 1;
  IF r IS NULL THEN RETURN true; END IF; -- sem config → não bloqueia

  -- Maintenance bloqueia tudo monetizável
  IF r.platform_mode = 'maintenance' THEN RETURN false; END IF;

  -- Kill switch global (só features pagas)
  IF p_key IN ('monetization','subscriptions','vip_channels','paid_content','payouts')
     AND r.monetization_enabled = false THEN
    RETURN false;
  END IF;

  RETURN CASE p_key
    WHEN 'monetization'     THEN r.monetization_enabled
    WHEN 'subscriptions'    THEN r.subscriptions_enabled
    WHEN 'vip_channels'     THEN r.vip_channels_enabled
    WHEN 'paid_content'     THEN r.paid_content_enabled
    WHEN 'payouts'          THEN r.payouts_enabled
    WHEN 'safe_meetings'    THEN r.safe_meetings_enabled
    WHEN 'whatsapp'         THEN r.whatsapp_enabled
    WHEN 'real_experiences' THEN r.real_experiences_enabled
    ELSE true
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.assert_platform_feature(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
