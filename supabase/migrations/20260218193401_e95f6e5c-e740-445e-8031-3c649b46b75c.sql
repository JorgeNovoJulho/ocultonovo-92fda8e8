-- Fix trigger: use correct column names for public_activities table
-- public_activities has: actor_id, target_creator_id (not user_id/target_user_id)
-- Also fix 'amount' column - check if it exists
CREATE OR REPLACE FUNCTION public.emit_subscription_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    INSERT INTO public.public_activities (actor_id, activity_type, target_creator_id, amount)
    VALUES (NEW.subscriber_id, 'subscription', NEW.creator_id, NEW.price);
  END IF;
  RETURN NEW;
END;
$$;