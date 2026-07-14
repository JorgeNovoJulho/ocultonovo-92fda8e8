
-- Validation trigger to enforce withdrawal limits
CREATE OR REPLACE FUNCTION public.validate_withdrawal_limits()
RETURNS TRIGGER AS $$
DECLARE
  daily_total numeric;
  monthly_count integer;
BEGIN
  -- Daily limit: sum of amounts in the last 24 hours
  SELECT COALESCE(SUM(amount), 0) INTO daily_total
  FROM public.withdrawal_requests
  WHERE user_id = NEW.user_id
    AND status NOT IN ('rejected')
    AND created_at >= NOW() - INTERVAL '24 hours';

  IF (daily_total + NEW.amount) > 1000 THEN
    RAISE EXCEPTION 'Limite diário de R$ 1.000,00 atingido. Já solicitado: R$ %.2f', daily_total;
  END IF;

  -- Monthly limit: max 4 withdrawals in current calendar month
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

-- Attach trigger
DROP TRIGGER IF EXISTS trg_validate_withdrawal_limits ON public.withdrawal_requests;
CREATE TRIGGER trg_validate_withdrawal_limits
  BEFORE INSERT ON public.withdrawal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_withdrawal_limits();
