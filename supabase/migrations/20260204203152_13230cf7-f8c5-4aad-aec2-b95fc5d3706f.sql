-- =====================================================
-- CORREÇÃO DE SEGURANÇA: Últimas funções com search_path
-- =====================================================

-- 1. notify_payment_status_change
CREATE OR REPLACE FUNCTION public.notify_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'payment',
      'Atualização de pagamento',
      'O status do seu pagamento foi atualizado para: ' || NEW.status,
      jsonb_build_object('transaction_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 2. notify_verification_rejection
CREATE OR REPLACE FUNCTION public.notify_verification_rejection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'verification',
      'Verificação rejeitada',
      COALESCE(NEW.rejection_reason, 'Sua solicitação de verificação foi rejeitada'),
      jsonb_build_object('verification_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. notify_critical_impersonation_access
CREATE OR REPLACE FUNCTION public.notify_critical_impersonation_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.action_type IN ('wallet_access', 'settings_change', 'delete_content') THEN
    INSERT INTO public.admin_notifications (type, title, body, data)
    VALUES (
      'critical_impersonation',
      'Acesso crítico em impersonificação',
      'Admin acessou área sensível durante impersonificação',
      jsonb_build_object('log_id', NEW.id, 'action', NEW.action_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 4. notify_madrinha_on_commission
CREATE OR REPLACE FUNCTION public.notify_madrinha_on_commission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.madrinha_id,
    'commission',
    'Nova comissão recebida!',
    format('Você recebeu R$ %.2f de comissão', NEW.commission_amount),
    jsonb_build_object('afilhada_id', NEW.creator_id, 'amount', NEW.commission_amount)
  );
  RETURN NEW;
END;
$$;

-- 5. clear_priority_on_creator_reply
CREATE OR REPLACE FUNCTION public.clear_priority_on_creator_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
BEGIN
  SELECT creator_id INTO v_creator_id FROM public.conversations WHERE id = NEW.conversation_id;
  
  IF NEW.sender_id = v_creator_id THEN
    UPDATE public.conversations 
    SET priority = false, priority_set_at = NULL 
    WHERE id = NEW.conversation_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 6. update_broadcast_read_count
CREATE OR REPLACE FUNCTION public.update_broadcast_read_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.read_at IS NOT NULL AND OLD.read_at IS NULL THEN
    UPDATE public.broadcasts 
    SET read_count = COALESCE(read_count, 0) + 1 
    WHERE id = NEW.broadcast_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. update_broadcast_unlock_metrics
CREATE OR REPLACE FUNCTION public.update_broadcast_unlock_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unlocked_at IS NOT NULL AND OLD.unlocked_at IS NULL THEN
    UPDATE public.broadcasts 
    SET unlock_count = COALESCE(unlock_count, 0) + 1,
        total_revenue = COALESCE(total_revenue, 0) + COALESCE(NEW.paid_amount, 0)
    WHERE id = NEW.broadcast_id;
  END IF;
  RETURN NEW;
END;
$$;