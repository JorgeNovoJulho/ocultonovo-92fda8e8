-- =====================================================================
-- VALIDAÇÃO DE GATES — Aura Rooms (vip_required, kyc_required, social/aura)
-- ---------------------------------------------------------------------
-- Rode no SQL Editor do Supabase EXTERNO. Apenas SELECT/EXEC — não muta nada.
-- Substitua os placeholders <UUID_*> e <SLUG_*> antes de rodar.
--
-- IMPORTANTE: os UUIDs ficam como TEXT em CTE e só são castados a uuid
-- via referência de coluna (runtime), evitando erro 22P02 na fase de plan.
-- =====================================================================

------------------------------------------------------------------
-- 0) Liste salas e seus requisitos atuais
------------------------------------------------------------------
SELECT slug, name, vip_only, required_plan, requires_kyc, couple_only,
       min_aura_level, min_social_score, min_prestige_xp,
       hour_from, hour_to
FROM public.oculto_aura_rooms
ORDER BY slug;

------------------------------------------------------------------
-- 1) CASO: vip_required (FREE em sala vip_only)
------------------------------------------------------------------
WITH raw AS (
  SELECT '<UUID_FREE_USER>'::text AS s, '<SLUG_VIP_ONLY>'::text AS slug
),
params AS (
  SELECT
    CASE WHEN s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN s::uuid ELSE NULL END AS uid,
    slug
  FROM raw
)
SELECT CASE
  WHEN uid IS NULL THEN jsonb_build_object(
    'ok', false, 'reason', 'replace_uuid_placeholder',
    'message', 'Substitua <UUID_FREE_USER> por um UUID real.'
  )
  ELSE (
    SELECT public.aura_room_join(slug)
    FROM (SELECT set_config('request.jwt.claims',
      json_build_object('sub', uid::text, 'role', 'authenticated')::text, true)) s
  )
END AS resultado_free_em_sala_vip
FROM params;

------------------------------------------------------------------
-- 2) CASO: kyc_required (PREMIUM sem KYC em sala requires_kyc)
------------------------------------------------------------------
WITH raw AS (
  SELECT '<UUID_PREMIUM_SEM_KYC>'::text AS s, '<SLUG_REQUIRES_KYC>'::text AS slug
),
params AS (
  SELECT
    CASE WHEN s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN s::uuid ELSE NULL END AS uid,
    slug
  FROM raw
)
SELECT CASE
  WHEN uid IS NULL THEN jsonb_build_object(
    'ok', false, 'reason', 'replace_uuid_placeholder',
    'message', 'Substitua <UUID_PREMIUM_SEM_KYC> por um UUID real.'
  )
  ELSE (
    SELECT public.aura_room_join(slug)
    FROM (SELECT set_config('request.jwt.claims',
      json_build_object('sub', uid::text, 'role', 'authenticated')::text, true)) s
  )
END AS resultado_sem_kyc
FROM params;

------------------------------------------------------------------
-- 3) CASO: social_score_low / aura_level_low
------------------------------------------------------------------
WITH raw AS (
  SELECT '<UUID_BAIXO_SCORE>'::text AS s, '<SLUG_HIGH_SOCIAL>'::text AS slug
),
params AS (
  SELECT
    CASE WHEN s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN s::uuid ELSE NULL END AS uid,
    slug
  FROM raw
)
SELECT CASE
  WHEN uid IS NULL THEN jsonb_build_object(
    'ok', false, 'reason', 'replace_uuid_placeholder',
    'message', 'Substitua <UUID_BAIXO_SCORE> por um UUID real.'
  )
  ELSE (
    SELECT public.aura_room_join(slug)
    FROM (SELECT set_config('request.jwt.claims',
      json_build_object('sub', uid::text, 'role', 'authenticated')::text, true)) s
  )
END AS resultado_score_baixo
FROM params;

------------------------------------------------------------------
-- 4) CASO POSITIVO: VIP com KYC entra normalmente
------------------------------------------------------------------
WITH raw AS (
  SELECT '<UUID_VIP_OK>'::text AS s, '<SLUG_VIP_ONLY>'::text AS slug
),
params AS (
  SELECT
    CASE WHEN s ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         THEN s::uuid ELSE NULL END AS uid,
    slug
  FROM raw
)
SELECT CASE
  WHEN uid IS NULL THEN jsonb_build_object(
    'ok', false, 'reason', 'replace_uuid_placeholder',
    'message', 'Substitua <UUID_VIP_OK> por um UUID real.'
  )
  ELSE (
    SELECT public.aura_room_join(slug)
    FROM (SELECT set_config('request.jwt.claims',
      json_build_object('sub', uid::text, 'role', 'authenticated')::text, true)) s
  )
END AS resultado_vip_ok
FROM params;

------------------------------------------------------------------
-- 5) AUDITORIA — quais salas cada usuário poderia entrar agora
------------------------------------------------------------------
WITH ids AS (
  SELECT raw_id FROM (VALUES
    ('<UUID_FREE_USER>'),
    ('<UUID_PREMIUM_SEM_KYC>'),
    ('<UUID_VIP_OK>')
  ) AS v(raw_id)
  WHERE raw_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
u AS (
  SELECT p.user_id, p.username, p.plan_type,
         COALESCE(p.is_verified, false) AS kyc_ok,
         COALESCE(ss.total_xp, 0)       AS score,
         COALESCE(p.aura_level, 0)      AS aura
  FROM public.profiles p
  LEFT JOIN public.oculto_social_scores ss ON ss.user_id = p.user_id
  WHERE p.user_id::text IN (SELECT raw_id FROM ids)
)
SELECT u.username, u.plan_type, r.slug AS sala,
       CASE
         WHEN r.vip_only AND u.plan_type <> 'vip' THEN 'plan_vip_required'
         WHEN r.required_plan = 'premium' AND u.plan_type NOT IN ('premium','vip') THEN 'plan_premium_required'
         WHEN r.requires_kyc AND NOT u.kyc_ok THEN 'kyc_required'
         WHEN r.min_social_score > u.score   THEN 'social_score_low'
         WHEN r.min_aura_level   > u.aura    THEN 'aura_level_low'
         ELSE 'OK'
       END AS gate
FROM u
CROSS JOIN public.oculto_aura_rooms r
ORDER BY u.username, r.slug;

-- Reset opcional do contexto JWT
SELECT set_config('request.jwt.claims', NULL, true);
