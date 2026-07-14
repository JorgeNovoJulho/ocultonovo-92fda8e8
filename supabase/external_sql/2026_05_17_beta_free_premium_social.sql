-- ============================================================
-- 2026_05_17_beta_free_premium_social.sql
-- Garante que durante o BETA os usuários FREE recebam
-- temporariamente os benefícios do plano Premium (social).
-- Idempotente: pode ser rodado várias vezes sem efeito colateral.
-- ============================================================

ALTER TABLE public.platform_runtime_settings
  ADD COLUMN IF NOT EXISTS beta_free_has_premium_social boolean NOT NULL DEFAULT true;

UPDATE public.platform_runtime_settings
SET beta_free_has_premium_social = true,
    updated_at = now()
WHERE platform_mode = 'beta';

INSERT INTO public.platform_runtime_settings (
  platform_mode, beta_enabled, beta_free_has_premium_social
)
SELECT 'beta', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_runtime_settings);

NOTIFY pgrst, 'reload schema';
