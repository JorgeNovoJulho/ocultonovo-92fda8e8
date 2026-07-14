-- ============================================================
-- 2026_06_01_platform_beta_ends_at.sql
-- Adiciona prazo de expiração do período de testes (Beta) ao
-- runtime global da plataforma. O frontend usa este campo para
-- esconder banners/modais automaticamente quando o Beta acabar.
-- Idempotente — pode ser executado várias vezes.
-- ============================================================

ALTER TABLE public.platform_runtime_settings
  ADD COLUMN IF NOT EXISTS beta_ends_at timestamptz;

-- Default sugerido: 30 dias a partir de agora SE ainda não definido.
-- Comente o UPDATE abaixo se preferir configurar manualmente pelo admin.
UPDATE public.platform_runtime_settings
SET beta_ends_at = now() + interval '30 days',
    updated_at  = now()
WHERE beta_ends_at IS NULL
  AND platform_mode = 'beta';

NOTIFY pgrst, 'reload schema';
