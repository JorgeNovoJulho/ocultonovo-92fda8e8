-- Add index for analytics queries on creator_referral_commissions
CREATE INDEX IF NOT EXISTS idx_creator_referral_commissions_created_at 
ON public.creator_referral_commissions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_referral_commissions_referral_id 
ON public.creator_referral_commissions(referral_id);

-- Function to notify madrinha when commission is received
CREATE OR REPLACE FUNCTION public.notify_madrinha_on_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_madrinha_id uuid;
  v_madrinha_user_id uuid;
  v_afilhada_name text;
  v_commission_amount numeric;
BEGIN
  -- Get madrinha info from the referral
  SELECT 
    cr.madrinha_id,
    p_madrinha.user_id,
    p_afilhada.display_name
  INTO v_madrinha_id, v_madrinha_user_id, v_afilhada_name
  FROM creator_referrals cr
  JOIN profiles p_madrinha ON p_madrinha.id = cr.madrinha_id
  JOIN profiles p_afilhada ON p_afilhada.id = cr.afilhada_id
  WHERE cr.id = NEW.referral_id;

  v_commission_amount := NEW.commission_amount;

  -- Insert in-app notification
  INSERT INTO notifications (
    user_id,
    actor_id,
    type,
    title,
    body,
    data,
    is_read
  ) VALUES (
    v_madrinha_user_id,
    (SELECT user_id FROM profiles WHERE id = (SELECT afilhada_id FROM creator_referrals WHERE id = NEW.referral_id)),
    'gift_received', -- Using existing type that fits
    '💰 Comissão Recebida!',
    'Sua afilhada ' || COALESCE(v_afilhada_name, 'uma criadora') || ' fez uma venda. Você ganhou R$ ' || TO_CHAR(v_commission_amount, 'FM999G999D00'),
    jsonb_build_object(
      'type', 'madrinha_commission',
      'commission_amount', v_commission_amount,
      'referral_id', NEW.referral_id,
      'transaction_id', NEW.transaction_id
    ),
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for commission notifications
DROP TRIGGER IF EXISTS on_commission_created ON public.creator_referral_commissions;
CREATE TRIGGER on_commission_created
AFTER INSERT ON public.creator_referral_commissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_madrinha_on_commission();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.notify_madrinha_on_commission() TO authenticated;