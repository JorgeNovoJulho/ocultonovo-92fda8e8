-- 1. Add is_lifetime column to profiles for users who never get billed
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_lifetime boolean NOT NULL DEFAULT false;

-- 2. Fix trigger to never downgrade lifetime users
CREATE OR REPLACE FUNCTION public.protect_lifetime_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is lifetime, always keep plan active and maintain plan_type
  IF OLD.is_lifetime = true THEN
    NEW.is_lifetime := true;
    NEW.payment_status := 'active';
    -- Keep plan at vip minimum
    IF NEW.plan_type = 'free' THEN
      NEW.plan_type := OLD.plan_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_lifetime_users ON public.profiles;
CREATE TRIGGER trg_protect_lifetime_users
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_lifetime_users();
