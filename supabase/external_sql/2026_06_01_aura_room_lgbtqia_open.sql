-- ============================================================================
-- Sala LGBTQIA+ recorrente, sempre visível e sem requisitos
-- Qualquer usuário pode entrar — sem gate de gênero, plano, KYC, score, aura
-- ou horário. Idempotente.
-- ============================================================================

UPDATE public.oculto_aura_rooms SET
  active             = true,
  open_to_all        = true,
  vip_only           = false,
  couple_only        = false,
  requires_kyc       = false,
  required_plan      = NULL,
  allowed_genders    = '{}'::text[],
  min_aura_level     = 0,
  min_social_score   = 0,
  min_prestige_xp    = 0,
  hour_from          = NULL,
  hour_to            = NULL,
  sort_order         = 5
WHERE slug = 'lgbtqia-plus';

INSERT INTO public.oculto_aura_rooms (
  slug, name, theme, hue, emoji, active, vip_only,
  hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp,
  required_plan, requires_kyc, couple_only, sort_order, glow_intensity,
  description, open_to_all, allowed_genders
)
SELECT
  'lgbtqia-plus', 'LGBTQIA+', 'Diversidade, orgulho e conexões livres',
  310, '🏳️‍🌈', true, false,
  NULL, NULL, 0, 0, 0,
  NULL, false, false, 5, 80,
  'Espaço seguro e aberto a toda a comunidade LGBTQIA+ — sem requisitos, entre quando quiser.',
  true, '{}'::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.oculto_aura_rooms WHERE slug = 'lgbtqia-plus'
);

NOTIFY pgrst, 'reload schema';
