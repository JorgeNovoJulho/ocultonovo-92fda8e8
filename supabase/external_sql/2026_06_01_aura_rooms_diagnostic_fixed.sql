-- =====================================================================
-- DIAGNÓSTICO — Gates de Aura Rooms para @ocultomaster vs @casaltomate
-- Idempotente, somente leitura. Cole no SQL Editor do Supabase EXTERNO.
-- Usa colunas reais de profiles (aura_level, social_score, prestige_xp).
-- =====================================================================

WITH targets AS (
  SELECT p.user_id AS uid,
         p.username,
         lower(coalesce(p.plan_type,'free'))                       AS plan_type,
         COALESCE(p.is_verified, false)                            AS kyc_ok,
         public._aura_normalize_gender(p.gender, p.profile_type)   AS gender_norm,
         COALESCE(p.aura_level, 0)                                 AS aura_level,
         COALESCE(p.social_score, 0)                               AS social_score,
         COALESCE(p.prestige_xp, 0)                                AS prestige_xp
  FROM public.profiles p
  WHERE p.username IN ('ocultomaster','casaltomate')
)
SELECT
  t.username,
  t.plan_type,
  t.kyc_ok,
  t.gender_norm,
  t.aura_level,
  t.social_score,
  t.prestige_xp,
  r.slug                                  AS sala,
  r.vip_only,
  r.required_plan,
  r.requires_kyc,
  r.couple_only,
  r.allowed_genders,
  r.min_aura_level,
  r.min_social_score,
  r.min_prestige_xp,
  r.open_to_all,
  -- Avaliação do gate (mesma lógica do _aura_room_check_gates, sem master bypass)
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
FROM targets t
CROSS JOIN public.oculto_aura_rooms r
ORDER BY t.username, r.slug;
