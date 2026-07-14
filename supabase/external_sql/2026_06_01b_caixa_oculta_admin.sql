-- ============================================================
-- 2026_06_01b_caixa_oculta_admin.sql
-- Incremental: adiciona setting refund_xp_on_cancel e RPC de logs.
-- Idempotente.
-- ============================================================

ALTER TABLE public.oculto_caixa_oculta_settings
  ADD COLUMN IF NOT EXISTS refund_xp_on_cancel BOOLEAN DEFAULT TRUE;

-- RPC: ler audit logs (apenas Master)
CREATE OR REPLACE FUNCTION public.cox_admin_audit_logs(p_limit INT DEFAULT 200)
RETURNS TABLE (
  id UUID,
  campaign_id UUID,
  actor_id UUID,
  action TEXT,
  new_data JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT l.id, l.campaign_id, l.actor_id, l.action, l.new_data, l.created_at
      FROM public.oculto_caixa_oculta_audit_logs l
     ORDER BY l.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 500));
END $$;
REVOKE ALL ON FUNCTION public.cox_admin_audit_logs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_admin_audit_logs(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
