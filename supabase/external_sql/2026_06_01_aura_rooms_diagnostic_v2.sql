-- =====================================================================
-- DIAGNÓSTICO v2 — Aura Rooms gates para @ocultomaster vs @casaltomate
-- Defensivo: usa to_jsonb(profiles) para acessar colunas opcionais sem
-- quebrar caso elas não existam (social_score, prestige_xp, aura_level,
-- gender, profile_type, is_verified). Somente leitura. Idempotente.
-- Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 0) PRIMEIRO: descubra quais colunas existem em profiles
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='profiles'
  AND column_name IN (
    'aura_level','social_score','prestige_xp','prestige_points','xp',
    'gender','profile_type','is_verified','plan_type','username','user_id'
  )
ORDER BY column_name;

-- 1) DIAGNÓSTICO defensivo (não falha se uma coluna não existir)
WITH targets AS (
  SELECT
    p.user_id                                            AS uid,
    p.username,
    lower(coalesce((to_jsonb(p)->>'plan_type'),'free'))  AS plan_type,
    COALESCE((to_jsonb(p)->>'is_verified')::boolean,false) AS kyc_ok,
    NULLIF(to_jsonb(p)->>'gender','')                    AS gender_raw,
    NULLIF(to_jsonb(p)->>'profile_type','')              AS profile_type_raw,
    COALESCE((to_jsonb(p)->>'aura_level')::int,0)        AS aura_level,
    COALESCE(
      (to_jsonb(p)->>'social_score')::int,
      0
    )                                                    AS social_score,
    COALESCE(
      (to_jsonb(p)->>'prestige_xp')::int,
      (to_jsonb(p)->>'prestige_points')::int,
      (to_jsonb(p)->>'xp')::int,
      0
    )                                                    AS prestige_xp
  FROM public.profiles p
  WHERE p.username IN ('ocultomaster','casaltomate')
),
targets_n AS (
  SELECT t.*,
         public._aura_normalize_gender(t.gender_raw, t.profile_type_raw) AS gender_norm
  FROM targets t
)
SELECT
  t.username, t.plan_type, t.kyc_ok, t.gender_raw, t.profile_type_raw, t.gender_norm,
  t.aura_level, t.social_score, t.prestige_xp,
  r.slug AS sala,
  r.vip_only, r.required_plan, r.requires_kyc, r.couple_only,
  r.allowed_genders, r.min_aura_level, r.min_social_score, r.min_prestige_xp, r.open_to_all,
  CASE
    WHEN COALESCE(r.open_to_all,false) THEN 'OK'
    WHEN r.vip_only AND t.plan_type NOT IN ('vip','vip_plus')                         THEN 'plan_vip_required'
    WHEN lower(coalesce(r.required_plan,''))='premium'
         AND t.plan_type NOT IN ('premium','vip','vip_plus')                          THEN 'plan_premium_required'
    WHEN lower(coalesce(r.required_plan,''))='vip'
         AND t.plan_type NOT IN ('vip','vip_plus')                                    THEN 'plan_vip_required'
    WHEN r.requires_kyc AND NOT t.kyc_ok                                              THEN 'kyc_required'
    WHEN COALESCE(r.couple_only,false) AND t.gender_norm IS DISTINCT FROM 'casal'     THEN 'couple_only'
    WHEN r.allowed_genders IS NOT NULL
         AND array_length(r.allowed_genders,1) IS NOT NULL
         AND (t.gender_norm IS NULL OR NOT (t.gender_norm = ANY(r.allowed_genders)))  THEN 'gender_not_allowed'
    WHEN COALESCE(r.min_aura_level,0)   > t.aura_level                                THEN 'aura_level_low'
    WHEN COALESCE(r.min_social_score,0) > t.social_score                              THEN 'social_score_low'
    WHEN COALESCE(r.min_prestige_xp,0)  > t.prestige_xp                               THEN 'prestige_low'
    ELSE 'OK'
  END AS gate_resultado
FROM targets_n t
CROSS JOIN public.oculto_aura_rooms r
ORDER BY t.username, r.slug;
