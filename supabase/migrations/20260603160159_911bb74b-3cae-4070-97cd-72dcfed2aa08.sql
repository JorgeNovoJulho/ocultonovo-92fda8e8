-- 1. Criar Índices de Performance para o Feed
CREATE INDEX IF NOT EXISTS idx_posts_main_feed_final ON public.posts (created_at DESC) 
WHERE (is_flash IS DISTINCT FROM true AND is_hidden IS DISTINCT FROM true);

-- 2. Criar a VIEW v_feed_posts com colunas validadas para destravar o frontend
CREATE OR REPLACE VIEW public.v_feed_posts AS
SELECT 
    p.id, 
    p.user_id as creator_id,
    p.user_id as author_id,
    p.content_text, 
    p.media_url, 
    p.media_urls,
    p.media_type, 
    p.thumbnail_url, 
    p.video_duration_seconds,
    p.privacy_level, 
    p.is_locked, 
    p.is_paid, 
    p.paid_price, 
    p.is_hidden,
    p.likes_count, 
    p.dislikes_count, 
    p.comments_count,
    p.saves_count,
    p.shares_count,
    p.is_flash, 
    p.post_type,
    p.created_at, 
    p.updated_at
FROM public.posts p
WHERE (p.is_hidden IS NOT TRUE)
  AND (p.is_flash IS NOT TRUE OR p.is_flash IS NULL);

GRANT SELECT ON public.v_feed_posts TO authenticated;
GRANT SELECT ON public.v_feed_posts TO anon;

-- 3. Corrigir o erro crítico de CRON (Job Agendado)
SELECT cron.unschedule('check-safety-checkins') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-safety-checkins'
);

SELECT cron.schedule(
  'check-safety-checkins',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bpmeahyvubewqmmdxsll.supabase.co/functions/v1/check-safety-checkins',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
