-- Function to notify admins on new paid subscriptions
CREATE OR REPLACE FUNCTION public.notify_admin_new_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when plan_type changes to a paid plan
  IF (OLD.plan_type IS DISTINCT FROM NEW.plan_type)
     AND NEW.plan_type IN ('premium', 'vip', 'master')
     AND (OLD.plan_type IS NULL OR OLD.plan_type = 'free')
  THEN
    PERFORM net.http_post(
      url := (SELECT value FROM system_settings WHERE key = 'supabase_url' LIMIT 1)
             || '/functions/v1/send-admin-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM system_settings WHERE key = 'service_role_key' LIMIT 1)
      ),
      body := jsonb_build_object(
        'title', '💳 Nova Assinatura',
        'body', COALESCE(NEW.name, 'Usuário') || ' assinou ' || UPPER(NEW.plan_type),
        'url', '/admin/users',
        'tag', 'admin-subscription',
        'type', 'admin_subscription'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Function to notify admins on new reports
CREATE OR REPLACE FUNCTION public.notify_admin_new_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  urgent_prefix text := '';
BEGIN
  IF NEW.is_urgent = true THEN
    urgent_prefix := '🚨 URGENTE: ';
  END IF;

  PERFORM net.http_post(
    url := (SELECT value FROM system_settings WHERE key = 'supabase_url' LIMIT 1)
           || '/functions/v1/send-admin-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM system_settings WHERE key = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object(
      'title', urgent_prefix || 'Nova Denúncia',
      'body', 'Categoria: ' || COALESCE(NEW.category, 'Não informada'),
      'url', '/admin/reports',
      'tag', 'admin-report',
      'type', 'admin_report'
    )
  );
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trg_notify_admin_subscription ON public.profiles;
CREATE TRIGGER trg_notify_admin_subscription
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_subscription();

DROP TRIGGER IF EXISTS trg_notify_admin_report ON public.anonymous_reports;
CREATE TRIGGER trg_notify_admin_report
  AFTER INSERT ON public.anonymous_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_report();
