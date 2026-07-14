
-- Fix: Update trigger to use subquery instead of LIMIT
CREATE OR REPLACE FUNCTION public.validate_withdrawal_limits()
RETURNS TRIGGER AS $$
DECLARE
  daily_total numeric;
  monthly_count integer;
  exception_id uuid;
BEGIN
  -- Check for approved and unused exception
  SELECT id INTO exception_id
  FROM public.withdrawal_exceptions
  WHERE user_id = NEW.user_id
    AND status = 'approved'
    AND is_used = false
    AND requested_amount >= NEW.amount
  ORDER BY created_at ASC
  FETCH FIRST 1 ROW ONLY;

  -- If user has a valid exception, mark it as used and skip limits
  IF exception_id IS NOT NULL THEN
    UPDATE public.withdrawal_exceptions
    SET is_used = true, used_at = NOW()
    WHERE id = exception_id;

    RETURN NEW;
  END IF;

  -- Daily limit
  SELECT COALESCE(SUM(amount), 0) INTO daily_total
  FROM public.withdrawal_requests
  WHERE user_id = NEW.user_id
    AND status NOT IN ('rejected')
    AND created_at >= NOW() - INTERVAL '24 hours';

  IF (daily_total + NEW.amount) > 1000 THEN
    RAISE EXCEPTION 'Limite diário de R$ 1.000,00 atingido. Já solicitado: R$ %.2f', daily_total;
  END IF;

  -- Monthly limit
  SELECT COUNT(*) INTO monthly_count
  FROM public.withdrawal_requests
  WHERE user_id = NEW.user_id
    AND status NOT IN ('rejected')
    AND date_trunc('month', created_at) = date_trunc('month', NOW());

  IF monthly_count >= 4 THEN
    RAISE EXCEPTION 'Você já atingiu o limite de 4 saques este mês';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
