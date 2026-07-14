-- =====================================================================
-- 2026_05_06: oculto_platform_plans → adiciona coluna `limits` JSONB
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

ALTER TABLE public.oculto_platform_plans
  ADD COLUMN IF NOT EXISTS limits JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Seed inicial (só preenche se vazio)
UPDATE public.oculto_platform_plans
SET limits = jsonb_build_object(
  'posts_no_blur_per_day', 10,
  'stories_per_day', 20,
  'max_messages_per_day', 10,
  'max_radar_searches_per_day', 5,
  'max_events_per_month', 0,
  'max_broadcasts_per_month', 0,
  'super_dm_per_month', 0
)
WHERE plan_type = 'free' AND limits = '{}'::jsonb;

UPDATE public.oculto_platform_plans
SET limits = jsonb_build_object(
  'posts_no_blur_per_day', -1,
  'stories_per_day', -1,
  'max_messages_per_day', -1,
  'max_radar_searches_per_day', -1,
  'max_events_per_month', 5,
  'max_broadcasts_per_month', 4,
  'super_dm_per_month', 5
)
WHERE plan_type = 'premium' AND limits = '{}'::jsonb;

UPDATE public.oculto_platform_plans
SET limits = jsonb_build_object(
  'posts_no_blur_per_day', -1,
  'stories_per_day', -1,
  'max_messages_per_day', -1,
  'max_radar_searches_per_day', -1,
  'max_events_per_month', -1,
  'max_broadcasts_per_month', -1,
  'super_dm_per_month', -1
)
WHERE plan_type = 'vip' AND limits = '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
