-- =====================================================================
-- Aura Match — Ajuste de requisitos das salas
--   • Lounge Solteiros: homem/mulher/trans + Aura nível 3+
--   • Adoramos Menage: homem/mulher/trans/casal + Aura nível 3+
--   • Conexões Secretas: aberta a todos (sem bloqueio incorreto)
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) LOUNGE SOLTEIROS
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = ARRAY['homem','mulher','trans']::text[],
  min_aura_level   = 3,
  min_social_score = 0,
  min_prestige_xp  = 0,
  required_plan    = NULL,
  vip_only         = false,
  requires_kyc     = false,
  open_to_all      = false
WHERE slug = 'lounge-solteiros';

-- 2) ADORAMOS MENAGE
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = ARRAY['homem','mulher','trans','casal']::text[],
  min_aura_level   = 3,
  min_social_score = 0,
  min_prestige_xp  = 0,
  required_plan    = NULL,
  vip_only         = false,
  requires_kyc     = false,
  open_to_all      = false
WHERE slug = 'adoramos-menage';

-- 3) CONEXÕES SECRETAS — aberta a todos. A camada de afinidade +18
--    é tratada em tempo de UI/recomendação, sem bloquear a entrada.
UPDATE public.oculto_aura_rooms SET
  couple_only      = false,
  allowed_genders  = '{}'::text[],
  min_aura_level   = 0,
  min_social_score = 0,
  min_prestige_xp  = 0,
  required_plan    = NULL,
  vip_only         = false,
  requires_kyc     = false,
  open_to_all      = true
WHERE slug = 'conexoes-secretas';

NOTIFY pgrst, 'reload schema';
