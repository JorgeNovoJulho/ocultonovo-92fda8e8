-- ============================================================
-- REFERRAL ADMIN PANEL — RPCs e views para /admin/programa-indicacoes
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- Requer: 2026_05_16_referral_consolidation_v3.sql aplicado.
-- ============================================================

-- Helper: é admin master?
CREATE OR REPLACE FUNCTION public._referral_is_master(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = _uid
      AND (
        COALESCE(p.is_admin, false) = true
        OR LOWER(COALESCE(p.username,'')) = 'ocultomaster'
      )
  );
$$;

-- ============================================================
-- 1) UPDATE CONFIG (admin master only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.referral_admin_update_config(p_patch jsonb)
RETURNS public.referral_program_config
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.referral_program_config;
BEGIN
  IF NOT public._referral_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.referral_program_config SET
    enabled                            = COALESCE((p_patch->>'enabled')::boolean, enabled),
    commission_pct                     = COALESCE((p_patch->>'commission_pct')::numeric, commission_pct),
    tracking_window_days               = COALESCE((p_patch->>'tracking_window_days')::int, tracking_window_days),
    withdraw_min_amount                = COALESCE((p_patch->>'withdraw_min_amount')::numeric, withdraw_min_amount),
    withdraw_monthly_limit             = COALESCE((p_patch->>'withdraw_monthly_limit')::int, withdraw_monthly_limit),
    withdraw_processing_business_days  = COALESCE((p_patch->>'withdraw_processing_business_days')::int, withdraw_processing_business_days),
    withdraw_cooldown_hours            = COALESCE((p_patch->>'withdraw_cooldown_hours')::int, withdraw_cooldown_hours),
    antifraud_block_self               = COALESCE((p_patch->>'antifraud_block_self')::boolean, antifraud_block_self),
    antifraud_block_same_device        = COALESCE((p_patch->>'antifraud_block_same_device')::boolean, antifraud_block_same_device),
    antifraud_block_same_ip            = COALESCE((p_patch->>'antifraud_block_same_ip')::boolean, antifraud_block_same_ip),
    commission_only_first_subscription = COALESCE((p_patch->>'commission_only_first_subscription')::boolean, commission_only_first_subscription),
    public_ranking_enabled             = COALESCE((p_patch->>'public_ranking_enabled')::boolean, public_ranking_enabled),
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = true
  RETURNING * INTO v_row;

  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.referral_admin_update_config(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_admin_update_config(jsonb) TO authenticated;

-- ============================================================
-- 2) APROVAR / REJEITAR SAQUE
-- ============================================================
CREATE OR REPLACE FUNCTION public.referral_admin_resolve_withdrawal(
  p_withdrawal_id uuid,
  p_action text,         -- 'approve' | 'reject' | 'paid'
  p_reason text DEFAULT NULL
)
RETURNS public.referral_withdrawals
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.referral_withdrawals;
BEGIN
  IF NOT public._referral_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_action NOT IN ('approve','reject','paid') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  UPDATE public.referral_withdrawals SET
    status        = CASE p_action
                      WHEN 'approve' THEN 'approved'
                      WHEN 'reject'  THEN 'rejected'
                      WHEN 'paid'    THEN 'paid'
                    END,
    reviewed_at   = CASE WHEN p_action IN ('approve','reject') THEN now() ELSE reviewed_at END,
    reviewed_by   = CASE WHEN p_action IN ('approve','reject') THEN auth.uid() ELSE reviewed_by END,
    paid_at       = CASE WHEN p_action = 'paid' THEN now() ELSE paid_at END,
    rejection_reason = CASE WHEN p_action = 'reject' THEN COALESCE(p_reason, rejection_reason) ELSE rejection_reason END
  WHERE id = p_withdrawal_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  -- Se rejeitado, devolver saldo (reverter ledger lock futuro — placeholder)
  -- O ledger original permanece confirmed; bloqueio é gerenciado por status do saque.

  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.referral_admin_resolve_withdrawal(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_admin_resolve_withdrawal(uuid,text,text) TO authenticated;

-- ============================================================
-- 3) VIEW: FILA DE SAQUES + INDICADOR
-- ============================================================
CREATE OR REPLACE VIEW public.v_referral_admin_withdrawals AS
SELECT
  w.id,
  w.user_id,
  w.amount,
  w.status,
  w.pix_key,
  w.pix_key_type,
  w.requested_at AS created_at,
  w.reviewed_at,
  w.paid_at,
  w.rejection_reason AS admin_note,
  p.username,
  p.name AS display_name,
  p.avatar_url,
  CASE
    WHEN LOWER(COALESCE(p.plan_type, 'free')) IN ('vip', 'vip_annual') THEN 'vip'
    WHEN LOWER(COALESCE(p.plan_type, 'free')) IN ('premium', 'premium_annual') THEN 'premium'
    ELSE 'free'
  END AS user_plan
FROM public.referral_withdrawals w
LEFT JOIN public.profiles p ON p.user_id = w.user_id;

ALTER VIEW public.v_referral_admin_withdrawals SET (security_invoker = on);
GRANT SELECT ON public.v_referral_admin_withdrawals TO authenticated;

-- ============================================================
-- 4) VIEW: MÉTRICAS GERAIS DO PROGRAMA
-- ============================================================
CREATE OR REPLACE VIEW public.v_referral_admin_metrics AS
SELECT
  (SELECT COUNT(*) FROM public.referral_users_tracking) AS total_tracked,
  (SELECT COUNT(*) FROM public.referral_users_tracking WHERE first_paid_at IS NOT NULL) AS total_converted,
  (SELECT COALESCE(SUM(commission_amount),0) FROM public.referral_ledger WHERE status IN ('confirmed','paid')) AS total_commissions,
  (SELECT COALESCE(SUM(amount),0) FROM public.referral_withdrawals WHERE status = 'paid') AS total_paid_out,
  (SELECT COUNT(*) FROM public.referral_withdrawals WHERE status = 'pending') AS pending_withdrawals,
  (SELECT COALESCE(SUM(amount),0) FROM public.referral_withdrawals WHERE status = 'pending') AS pending_withdrawal_amount,
  (SELECT COUNT(*) FROM public.referral_antifraud_events WHERE created_at > now() - interval '30 days') AS antifraud_events_30d;

ALTER VIEW public.v_referral_admin_metrics SET (security_invoker = on);
GRANT SELECT ON public.v_referral_admin_metrics TO authenticated;

-- ============================================================
-- 5) RLS leve: somente master lê eventos antifraude diretamente
-- ============================================================
ALTER TABLE public.referral_antifraud_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rae_master_read ON public.referral_antifraud_events;
CREATE POLICY rae_master_read ON public.referral_antifraud_events
  FOR SELECT TO authenticated
  USING (public._referral_is_master(auth.uid()));

-- Colunas opcionais usadas pelo painel (idempotente)
NOTIFY pgrst, 'reload schema';
