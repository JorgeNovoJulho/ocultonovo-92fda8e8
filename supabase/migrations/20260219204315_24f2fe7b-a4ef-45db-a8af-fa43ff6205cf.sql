-- Remover job existente se houver e recriar
SELECT cron.unschedule('check-safety-checkins') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-safety-checkins'
);

SELECT cron.schedule(
  'check-safety-checkins',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/check-safety-checkins',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
