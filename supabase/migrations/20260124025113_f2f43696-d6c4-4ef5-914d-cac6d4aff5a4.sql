-- Trigger function para detectar mudança de payment_status e disparar alertas imediatos
CREATE OR REPLACE FUNCTION notify_payment_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando status muda para 'overdue' (vindo de qualquer outro status)
  IF NEW.payment_status = 'overdue' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'overdue') THEN
    -- Inserir notificação in-app para o usuário
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'payment_overdue',
      '💳 Pagamento Atrasado',
      format('Seu pagamento de R$ %s está atrasado. Regularize para continuar acessando todos os recursos.', COALESCE(NEW.subscription_amount, 0)::numeric(10,2)),
      jsonb_build_object(
        'action', 'payment_required', 
        'profile_id', NEW.id,
        'amount', COALESCE(NEW.subscription_amount, 0),
        'triggered_at', now()
      )
    );
    
    -- Inserir notificação para admins
    INSERT INTO admin_notifications (type, title, body, data)
    VALUES (
      'payment_overdue',
      '💳 Novo Usuário Inadimplente',
      format('%s está com pagamento atrasado (R$ %s)', COALESCE(NEW.name, 'Usuário'), COALESCE(NEW.subscription_amount, 0)::numeric(10,2)),
      jsonb_build_object(
        'user_id', NEW.user_id, 
        'profile_id', NEW.id, 
        'name', NEW.name,
        'amount', COALESCE(NEW.subscription_amount, 0),
        'payment_due_date', NEW.payment_due_date,
        'triggered_at', now()
      )
    );

    -- Log para debugging
    RAISE NOTICE 'Payment status changed to overdue for user %', NEW.user_id;
  END IF;
  
  -- Quando status muda para 'suspended' (após 7 dias)
  IF NEW.payment_status = 'suspended' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'suspended') THEN
    -- Inserir notificação in-app para o usuário
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'account_suspended',
      '🚫 Conta Suspensa',
      'Sua conta foi suspensa por falta de pagamento. Regularize para recuperar o acesso.',
      jsonb_build_object(
        'action', 'account_suspended', 
        'profile_id', NEW.id,
        'amount', COALESCE(NEW.subscription_amount, 0),
        'triggered_at', now()
      )
    );
    
    -- Inserir notificação para admins
    INSERT INTO admin_notifications (type, title, body, data)
    VALUES (
      'account_suspended',
      '🚫 Conta Suspensa',
      format('%s teve a conta suspensa por inadimplência', COALESCE(NEW.name, 'Usuário')),
      jsonb_build_object(
        'user_id', NEW.user_id, 
        'profile_id', NEW.id, 
        'name', NEW.name,
        'amount', COALESCE(NEW.subscription_amount, 0),
        'triggered_at', now()
      )
    );

    RAISE NOTICE 'Account suspended for user %', NEW.user_id;
  END IF;

  -- Quando status muda para 'paid' (regularização)
  IF NEW.payment_status = 'paid' AND OLD.payment_status IN ('overdue', 'suspended') THEN
    -- Inserir notificação in-app para o usuário
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.user_id,
      'payment_confirmed',
      '✅ Pagamento Confirmado',
      'Seu pagamento foi confirmado e sua conta está regularizada!',
      jsonb_build_object(
        'action', 'payment_confirmed', 
        'profile_id', NEW.id,
        'triggered_at', now()
      )
    );
    
    -- Inserir notificação para admins
    INSERT INTO admin_notifications (type, title, body, data)
    VALUES (
      'payment_confirmed',
      '✅ Pagamento Regularizado',
      format('%s regularizou o pagamento', COALESCE(NEW.name, 'Usuário')),
      jsonb_build_object(
        'user_id', NEW.user_id, 
        'profile_id', NEW.id, 
        'name', NEW.name,
        'previous_status', OLD.payment_status,
        'triggered_at', now()
      )
    );

    -- Resetar contador de lembretes
    NEW.payment_reminder_count := 0;
    NEW.last_payment_reminder_at := NULL;

    RAISE NOTICE 'Payment confirmed for user %', NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dropar trigger existente se houver
DROP TRIGGER IF EXISTS on_payment_status_change ON profiles;

-- Criar trigger na tabela profiles
CREATE TRIGGER on_payment_status_change
  BEFORE UPDATE OF payment_status ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_payment_status_change();