
-- Trigger function: on status change, call edge function asynchronously via pg_net
CREATE OR REPLACE FUNCTION public.notify_founder_status_change()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  supabase_url text;
  anon_key text;
BEGIN
  -- Only fire when status actually changes from pending
  IF OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected') THEN
    payload := jsonb_build_object(
      'type', 'status_change',
      'application_id', NEW.id,
      'new_status', NEW.status,
      'old_status', OLD.status
    );

    -- Use pg_net for async HTTP call (non-blocking)
    PERFORM net.http_post(
      url := 'https://bpmeahyvubewqmmdxsll.supabase.co/functions/v1/notify-founder-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbWVhaHl2dWJld3FtbWR4c2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTc1NjcsImV4cCI6MjA4NDY3MzU2N30.nT_SluiMRbZUNAW3DeeC_eIty3GbIkz7_w-SnfgHUys'
      ),
      body := payload
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_notify_founder_status ON public.creator_founder_applications;
CREATE TRIGGER trg_notify_founder_status
  AFTER UPDATE ON public.creator_founder_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_founder_status_change();
