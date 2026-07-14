-- Insere/garante o slide "Bio de Áudio" no carrossel "Descubra o Universo Oculto".
-- Idempotente: pode ser rodado várias vezes sem duplicar.

INSERT INTO public.feed_discovery_slides (
  slug,
  title,
  description,
  cta_label,
  cta_route,
  icon,
  category,
  target_plans,
  priority,
  is_new,
  is_active,
  requires_kyc
)
VALUES (
  'bio-audio',
  'Bio de Áudio',
  'Sua voz vale mais que mil palavras. Grave uma bio de áudio de até 30s e conquiste mais conexões.',
  'Configurar minha bio de áudio',
  '/profile#voice-bio',
  'sparkles',
  'creator',
  ARRAY['free','premium','vip']::text[],
  72,
  true,
  true,
  false
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  cta_label = EXCLUDED.cta_label,
  cta_route = EXCLUDED.cta_route,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  target_plans = EXCLUDED.target_plans,
  priority = EXCLUDED.priority,
  is_new = EXCLUDED.is_new,
  is_active = true,
  requires_kyc = EXCLUDED.requires_kyc,
  starts_at = NULL,
  ends_at = NULL;
