
-- Trigger to increment referrer click counter when age is confirmed
CREATE OR REPLACE FUNCTION public.increment_referrer_clicks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referrer_id IS NOT NULL AND NEW.confirmed_age = true THEN
    UPDATE profiles
    SET external_clicks_count = COALESCE(external_clicks_count, 0) + 1
    WHERE id = NEW.referrer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_referrer_clicks ON public.share_click_tracking;
CREATE TRIGGER trg_increment_referrer_clicks
  AFTER INSERT OR UPDATE OF confirmed_age ON public.share_click_tracking
  FOR EACH ROW
  WHEN (NEW.confirmed_age = true)
  EXECUTE FUNCTION public.increment_referrer_clicks();
