-- =====================================================================
-- CALIBRAÇÃO FINAL — Requisitos mínimos das Salas Ocultas (Aura Rooms)
-- ---------------------------------------------------------------------
-- Baseline de teste:
--   • @ocultomaster  → master (bypass total via _aura_is_master)
--   • @casaltomate   → plan=gratuito, kyc=true, gender=casal,
--                      aura_level=4, social_score=0, prestige_xp=0
--
-- Regras aplicadas:
--   1. social_score e prestige_xp são ZERADOS em todas as salas
--      (contadores ainda não populados — bloqueariam 100% dos usuários).
--   2. aura_level mínimo conservador (0–3) por tier da sala.
--   3. couple_only / allowed_genders só onde o tema exige.
--   4. vip_only / required_plan apenas nas salas premium/elite.
--   5. open_to_all=false em todas (gate real avaliado), exceto fallback.
--
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

BEGIN;

-- 0) RESET universal: limpa estado herdado da calibração anterior
--    (que tinha aberto tudo) e zera contadores não-populados.
UPDATE public.oculto_aura_rooms
SET min_social_score = 0,
    min_prestige_xp  = 0,
    hour_from        = NULL,
    hour_to          = NULL,
    active           = true;

-- 1) Default seguro para salas sem regra explícita abaixo:
--    aberta a todos os gêneros, free, sem KYC, aura 0+.
UPDATE public.oculto_aura_rooms
SET vip_only        = false,
    required_plan   = NULL,
    requires_kyc    = false,
    couple_only     = false,
    allowed_genders = '{}'::text[],
    min_aura_level  = 0,
    open_to_all     = false;

-- =====================================================================
-- 2) SALAS TEMÁTICAS — gates específicos
-- =====================================================================

-- 2.1) CASAIS EM SINTONIA → exclusiva para casais
UPDATE public.oculto_aura_rooms SET
  couple_only     = true,
  allowed_genders = ARRAY['casal']::text[],
  min_aura_level  = 0
WHERE slug = 'casais-em-sintonia';

-- 2.2) LOUNGE SOLTEIROS → solteiros (homem/mulher/trans), sem casais
UPDATE public.oculto_aura_rooms SET
  couple_only     = false,
  allowed_genders = ARRAY['homem','mulher','trans']::text[],
  min_aura_level  = 0
WHERE slug = 'lounge-solteiros';

-- 2.3) LGBTQIA+ → trans em destaque + homem/mulher/casal
UPDATE public.oculto_aura_rooms SET
  couple_only     = false,
  allowed_genders = ARRAY['trans','homem','mulher','casal']::text[],
  min_aura_level  = 0
WHERE slug = 'lgbtqia-plus';

-- 2.4) ADORAMOS MENAGE → todos os perfis
UPDATE public.oculto_aura_rooms SET
  couple_only     = false,
  allowed_genders = ARRAY['homem','mulher','trans','casal']::text[],
  min_aura_level  = 0
WHERE slug = 'adoramos-menage';

-- 2.5) ENERGIA LIVRE → aberta, exige Aura 1+ (engajamento mínimo)
UPDATE public.oculto_aura_rooms SET
  allowed_genders = '{}'::text[],
  min_aura_level  = 1
WHERE slug = 'energia-livre';

-- 2.6) CONEXÕES SECRETAS → totalmente aberta
UPDATE public.oculto_aura_rooms SET
  open_to_all = true
WHERE slug = 'conexoes-secretas';

-- =====================================================================
-- 3) SALAS PREMIUM / VIP / ELITE — gate por plano
-- =====================================================================

-- 3.1) AURA ELITE → VIP only, aura 3+
UPDATE public.oculto_aura_rooms SET
  vip_only        = true,
  required_plan   = 'vip',
  min_aura_level  = 3
WHERE slug = 'aura-elite';

-- 3.2) AFTER OCULTO → Premium+ (Premium ou VIP), aura 2+
UPDATE public.oculto_aura_rooms SET
  vip_only        = false,
  required_plan   = 'premium',
  min_aura_level  = 2
WHERE slug = 'after-oculto';

-- 3.3) CICLO CASAIS VIP → casal + VIP
UPDATE public.oculto_aura_rooms SET
  couple_only     = true,
  allowed_genders = ARRAY['casal']::text[],
  vip_only        = true,
  required_plan   = 'vip'
WHERE slug = 'ciclo-casais-vip';

-- 3.4) CICLO FOUNDERS → VIP only (sala dos fundadores)
UPDATE public.oculto_aura_rooms SET
  vip_only        = true,
  required_plan   = 'vip'
WHERE slug = 'ciclo-founders';

-- =====================================================================
-- 4) CICLOS GERAIS (ciclo-*) — abertos a todos, sem requisito
--    A migration default já deixou estes corretos. Reforço de segurança:
-- =====================================================================
UPDATE public.oculto_aura_rooms
SET vip_only        = false,
    required_plan   = NULL,
    requires_kyc    = false,
    couple_only     = false,
    allowed_genders = '{}'::text[],
    min_aura_level  = 0,
    open_to_all     = false
WHERE slug LIKE 'ciclo-%'
  AND slug NOT IN ('ciclo-casais-vip','ciclo-founders');

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =====================================================================
-- 5) VALIDAÇÃO PÓS-CALIBRAÇÃO — rode em seguida para conferir
-- =====================================================================
-- Esperado:
--   • ocultomaster: TODAS as salas = OK (bypass master)
--   • casaltomate: OK em ciclos, casais-em-sintonia, lgbtqia-plus,
--     adoramos-menage, energia-livre, conexoes-secretas;
--     BLOQUEADO em aura-elite (plan_vip_required), after-oculto
--     (plan_premium_required), ciclo-casais-vip (plan_vip_required),
--     ciclo-founders (plan_vip_required), lounge-solteiros
--     (gender_not_allowed — é casal).
--
-- WITH targets AS (
--   SELECT p.user_id AS uid, p.username,
--     lower(coalesce(p.plan_type,'free')) AS plan_type,
--     COALESCE(p.is_verified,false) AS kyc_ok,
--     public._aura_normalize_gender(p.gender, p.profile_type) AS gender_norm,
--     COALESCE(p.aura_level,0) AS aura_level
--   FROM public.profiles p
--   WHERE p.username IN ('ocultomaster','casaltomate')
-- )
-- SELECT t.username, r.slug,
--   public._aura_room_check_gates(r.slug, t.uid)->>'allowed' AS allowed,
--   public._aura_room_check_gates(r.slug, t.uid)->'reasons'  AS reasons
-- FROM targets t CROSS JOIN public.oculto_aura_rooms r
-- ORDER BY t.username, r.slug;
