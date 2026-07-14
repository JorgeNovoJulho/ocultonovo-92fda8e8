-- Update admin notification trigger functions with correct URL/key
CREATE OR REPLACE FUNCTION public.notify_admin_new_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.plan_type IS DISTINCT FROM NEW.plan_type)
     AND NEW.plan_type IN ('premium', 'vip', 'master')
     AND (OLD.plan_type IS NULL OR OLD.plan_type = 'free')
  THEN
    PERFORM net.http_post(
      url := 'https://bpmeahyvubewqmmdxsll.supabase.co/functions/v1/send-admin-notification',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbWVhaHl2dWJld3FtbWR4c2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTc1NjcsImV4cCI6MjA4NDY3MzU2N30.nT_SluiMRbZUNAW3DeeC_eIty3GbIkz7_w-SnfgHUys"}'::jsonb,
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
    url := 'https://bpmeahyvubewqmmdxsll.supabase.co/functions/v1/send-admin-notification',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbWVhaHl2dWJld3FtbWR4c2xsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTc1NjcsImV4cCI6MjA4NDY3MzU2N30.nT_SluiMRbZUNAW3DeeC_eIty3GbIkz7_w-SnfgHUys"}'::jsonb,
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
