-- =============================================================
-- Auditoria do Programa de Indicações
-- - referral_audit_log: registra mudanças de config singleton
--   e decisões de saques (approve / reject / paid).
-- - Triggers preenchem automaticamente.
-- Idempotente.
-- =============================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.referral_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,                          -- quem fez (auth.uid())
  entity_type  text NOT NULL,                 -- 'config' | 'withdrawal'
  entity_id    text,                          -- id do withdrawal ou 'singleton'
  action       text NOT NULL,                 -- 'update' | 'approve' | 'reject' | 'paid' | 'cancel'
  before_data  jsonb,
  after_data   jsonb,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ral_created  ON public.referral_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ral_entity   ON public.referral_audit_log(entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ral_actor    ON public.referral_audit_log(actor_id, created_at DESC);

ALTER TABLE public.referral_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ral_master_read ON public.referral_audit_log;
CREATE POLICY ral_master_read ON public.referral_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_master());

DROP POLICY IF EXISTS ral_service_all ON public.referral_audit_log;
CREATE POLICY ral_service_all ON public.referral_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Trigger: config singleton (UPDATE)
CREATE OR REPLACE FUNCTION public.referral_audit_config_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.referral_audit_log(actor_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (
    auth.uid(),
    'config',
    'singleton',
    'update',
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_referral_config ON public.referral_program_config;
CREATE TRIGGER trg_audit_referral_config
  AFTER UPDATE ON public.referral_program_config
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.referral_audit_config_change();

-- 3) Trigger: decisões de saque (status mudou)
CREATE OR REPLACE FUNCTION public.referral_audit_withdrawal_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_action := CASE NEW.status
    WHEN 'approved'  THEN 'approve'
    WHEN 'paid'      THEN 'paid'
    WHEN 'rejected'  THEN 'reject'
    WHEN 'cancelled' THEN 'cancel'
    WHEN 'processing' THEN 'processing'
    ELSE 'update'
  END;

  INSERT INTO public.referral_audit_log(actor_id, entity_type, entity_id, action, before_data, after_data, note)
  VALUES (
    COALESCE(NEW.reviewed_by, auth.uid()),
    'withdrawal',
    NEW.id::text,
    v_action,
    jsonb_build_object('status', OLD.status, 'amount', OLD.amount),
    jsonb_build_object('status', NEW.status, 'amount', NEW.amount,
                       'reviewed_by', NEW.reviewed_by,
                       'paid_at', NEW.paid_at),
    NEW.rejection_reason
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_referral_withdrawal ON public.referral_withdrawals;
CREATE TRIGGER trg_audit_referral_withdrawal
  AFTER UPDATE ON public.referral_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.referral_audit_withdrawal_change();

-- 4) View enriquecida (junta nome do actor)
CREATE OR REPLACE VIEW public.v_referral_audit_log AS
SELECT
  a.id,
  a.actor_id,
  COALESCE(p.username, p.name, '—') AS actor_label,
  a.entity_type,
  a.entity_id,
  a.action,
  a.before_data,
  a.after_data,
  a.note,
  a.created_at
FROM public.referral_audit_log a
LEFT JOIN public.profiles p ON p.user_id = a.actor_id;

ALTER VIEW public.v_referral_audit_log SET (security_invoker = on);
GRANT SELECT ON public.v_referral_audit_log TO authenticated;
