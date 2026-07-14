
-- Create withdrawal_exceptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.withdrawal_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  requested_amount NUMERIC NOT NULL,
  justification TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  risk_level TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  is_used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.withdrawal_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exceptions" ON public.withdrawal_exceptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own exceptions" ON public.withdrawal_exceptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all exceptions" ON public.withdrawal_exceptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- Trigger: Auto-create admin notification on new withdrawal exception
CREATE OR REPLACE FUNCTION public.notify_admin_high_risk_exception()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.admin_notifications (type, title, body, data)
    VALUES (
      'critical_report',
      '⚠️ RISCO ALTO: Solicitação de saque de R$ ' || TRIM(TO_CHAR(NEW.requested_amount, '999G999D00')),
      'Criador solicitou limite especial de R$ ' || TRIM(TO_CHAR(NEW.requested_amount, '999G999D00')) || '. Justificativa: ' || COALESCE(LEFT(NEW.justification, 100), 'Não informada'),
      jsonb_build_object('exception_id', NEW.id, 'user_id', NEW.user_id, 'amount', NEW.requested_amount, 'url', '/admin/special-requests')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_high_risk_exception ON public.withdrawal_exceptions;
CREATE TRIGGER trg_notify_high_risk_exception
  AFTER INSERT ON public.withdrawal_exceptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_high_risk_exception();

-- Trigger: Notify admin on new VIP withdrawal requests
CREATE OR REPLACE FUNCTION public.notify_admin_vip_withdrawal()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_is_vip BOOLEAN;
BEGIN
  SELECT 
    COALESCE(p.display_name, p.username, 'Criador'),
    COALESCE(p.is_verified, false)
  INTO v_username, v_is_vip
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF NEW.status = 'pending' AND (NEW.amount >= 100 OR v_is_vip) THEN
    INSERT INTO public.admin_notifications (type, title, body, data)
    VALUES (
      'verification',
      '💰 Saque Pendente: R$ ' || TRIM(TO_CHAR(NEW.amount, '999G999D00')),
      v_username || ' solicitou saque de R$ ' || TRIM(TO_CHAR(NEW.amount, '999G999D00')) || ' via PIX.',
      jsonb_build_object('withdrawal_id', NEW.id, 'user_id', NEW.user_id, 'amount', NEW.amount, 'url', '/admin/withdrawals')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_vip_withdrawal ON public.withdrawal_requests;
CREATE TRIGGER trg_notify_vip_withdrawal
  AFTER INSERT ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_vip_withdrawal();

-- Trigger: Notify admin on security events
CREATE OR REPLACE FUNCTION public.notify_admin_security_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action_type IN ('login_failed', 'suspicious_login', 'brute_force_detected', 'account_locked') THEN
    INSERT INTO public.admin_notifications (type, title, body, data)
    VALUES (
      'critical_impersonation',
      '🔒 Alerta de Segurança: ' || REPLACE(NEW.action_type, '_', ' '),
      'Atividade suspeita detectada. IP: ' || COALESCE(NEW.ip_address, 'desconhecido'),
      jsonb_build_object('audit_id', NEW.id, 'action', NEW.action_type, 'ip', NEW.ip_address, 'url', '/admin/audit')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_notify_security_alert ON public.audit_logs;
CREATE TRIGGER trg_notify_security_alert
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_security_alert();
