-- Add is_pioneiro flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_pioneiro BOOLEAN DEFAULT false;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_profiles_is_pioneiro ON public.profiles (is_pioneiro) WHERE is_pioneiro = true;

-- Create function to count pioneer slots used
CREATE OR REPLACE FUNCTION public.get_pioneer_slots_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_slots INT := 150;
  filled_slots INT;
BEGIN
  SELECT COUNT(*) INTO filled_slots
  FROM profiles
  WHERE is_pioneiro = true;
  
  RETURN json_build_object(
    'total', total_slots,
    'filled', filled_slots,
    'remaining', GREATEST(0, total_slots - filled_slots),
    'is_full', filled_slots >= total_slots
  );
END;
$$;

-- Grant execute to authenticated and anon
GRANT EXECUTE ON FUNCTION public.get_pioneer_slots_status() TO authenticated, anon;

-- Mark existing waitlist users with source 'pioneiros' as pioneers when they convert
-- (This will be handled by the checkout flow)