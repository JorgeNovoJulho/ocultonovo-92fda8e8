-- =====================================================================
-- 2026_05_06: oculto_platform_plans → adiciona limite perfect_pair_rounds_per_day
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- Free: 10 rodadas/dia
UPDATE public.oculto_platform_plans
SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object('perfect_pair_rounds_per_day', 10)
WHERE plan_type = 'free'
  AND NOT (limits ? 'perfect_pair_rounds_per_day');

-- Premium / VIP: ilimitado
UPDATE public.oculto_platform_plans
SET limits = COALESCE(limits, '{}'::jsonb) || jsonb_build_object('perfect_pair_rounds_per_day', -1)
WHERE plan_type IN ('premium','vip')
  AND NOT (limits ? 'perfect_pair_rounds_per_day');

NOTIFY pgrst, 'reload schema';
