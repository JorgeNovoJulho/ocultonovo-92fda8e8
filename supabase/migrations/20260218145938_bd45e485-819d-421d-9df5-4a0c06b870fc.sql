-- Fix broken trigger that references non-existent 'status' column
CREATE OR REPLACE FUNCTION notify_payment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only notify if payment_status actually changed
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    PERFORM pg_notify(
      'payment_status_change',
      json_build_object(
        'profile_id', NEW.id,
        'old_status', OLD.payment_status,
        'new_status', NEW.payment_status
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$;