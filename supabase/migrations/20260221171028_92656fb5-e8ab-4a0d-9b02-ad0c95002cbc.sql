
-- Update pioneer slots from 150 to 1000
CREATE OR REPLACE FUNCTION public.get_pioneer_slots_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_slots INT := 1000;
  filled_slots INT;
BEGIN
  SELECT COUNT(*) INTO filled_slots
  FROM profiles
  WHERE is_pioneiro = true AND payment_status = 'active';
  
  RETURN json_build_object(
    'total', total_slots,
    'filled', filled_slots,
    'remaining', GREATEST(0, total_slots - filled_slots),
    'is_full', filled_slots >= total_slots
  );
END;
$$;
