-- =====================================================================
-- 2026_06_17_fix_andarilha_weekly_chest_history.sql
-- Corrige o cofre semanal da @andarilha que ficou gravado com Nível 15,
-- +400 XP e +2 Super DM, apesar do perfil real estar em Nível 2 / 115 XP.
-- Também recria as RPCs do cofre para sempre usar o perfil canônico
-- isolado por usuário.
--
-- Rodar no SQL Editor do Supabase EXTERNO.
-- Idempotente: pode rodar várias vezes.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Helper seguro: resolve profile.id priorizando profiles.id = auth.uid().
--    Só usa profiles.user_id como fallback quando não há ambiguidade.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_resolve_profile_id(p_identity uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF p_identity IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.id = p_identity
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT p.id
    INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = p_identity
     AND NOT EXISTS (
       SELECT 1
         FROM public.profiles p2
        WHERE p2.user_id = p_identity
          AND p2.id <> p.id
     )
   ORDER BY p.created_at ASC NULLS LAST
   LIMIT 1;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.aura_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.aura_resolve_profile_id(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.aura_resolve_profile_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aura_current_profile_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Diagnóstico ANTES.
-- ---------------------------------------------------------------------
SELECT 'ANTES — perfil andarilha' AS step,
       p.id,
       p.user_id,
       p.username,
       p.aura_xp,
       p.aura_level,
       p.created_at
  FROM public.profiles p
 WHERE lower(coalesce(p.username, '')) = 'andarilha'
 ORDER BY p.created_at ASC NULLS LAST;

SELECT 'ANTES — cofres ligados à andarilha' AS step,
       c.id AS chest_id,
       c.user_id AS chest_user_id,
       p.id AS matched_profile_id,
       p.user_id AS matched_auth_user_id,
       p.username,
       p.aura_xp AS profile_aura_xp,
       p.aura_level AS profile_aura_level,
       c.week_key,
       c.level_at_claim,
       c.xp_awarded,
       c.super_dm_awarded,
       c.claimed_at
  FROM public.oculto_aura_weekly_chests c
  JOIN public.profiles p
    ON p.id = public.aura_resolve_profile_id(c.user_id)
 WHERE lower(coalesce(p.username, '')) = 'andarilha'
 ORDER BY c.claimed_at DESC;

-- ---------------------------------------------------------------------
-- 3) Corrige o histórico da @andarilha.
--    Regra do cofre por nível real:
--      XP = LEAST(500, 50 + (nível - 1) * 25)
--      Super DM = +1 no nível >=5, +1 no nível >=10, +1 no nível >=20
--    Para nível 2: +75 XP e 0 Super DM.
-- ---------------------------------------------------------------------
WITH andarilha AS (
  SELECT p.id AS profile_id,
         p.user_id AS auth_user_id,
         COALESCE(p.aura_level, 1)::int AS real_level
    FROM public.profiles p
   WHERE lower(coalesce(p.username, '')) = 'andarilha'
   ORDER BY p.created_at ASC NULLS LAST
   LIMIT 1
), fixed AS (
  UPDATE public.oculto_aura_weekly_chests c
     SET level_at_claim = a.real_level,
         xp_awarded = LEAST(500, 50 + (a.real_level - 1) * 25),
         super_dm_awarded = CASE WHEN a.real_level >= 5 THEN 1 ELSE 0 END
                          + CASE WHEN a.real_level >= 10 THEN 1 ELSE 0 END
                          + CASE WHEN a.real_level >= 20 THEN 1 ELSE 0 END
    FROM andarilha a
   WHERE public.aura_resolve_profile_id(c.user_id) = a.profile_id
     AND (
       c.level_at_claim IS DISTINCT FROM a.real_level
       OR c.xp_awarded IS DISTINCT FROM LEAST(500, 50 + (a.real_level - 1) * 25)
       OR c.super_dm_awarded IS DISTINCT FROM (
            CASE WHEN a.real_level >= 5 THEN 1 ELSE 0 END
          + CASE WHEN a.real_level >= 10 THEN 1 ELSE 0 END
          + CASE WHEN a.real_level >= 20 THEN 1 ELSE 0 END
       )
     )
   RETURNING c.*
)
SELECT 'COFRES CORRIGIDOS — andarilha' AS step,
       id AS chest_id,
       user_id AS chest_user_id,
       week_key,
       level_at_claim,
       xp_awarded,
       super_dm_awarded,
       claimed_at
  FROM fixed;

-- ---------------------------------------------------------------------
-- 4) Recria aura_weekly_chest_status() sem misturar usuários.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(
  week_key text,
  claimed boolean,
  claimed_at timestamptz,
  next_claim_at timestamptz,
  level int,
  xp_preview int,
  super_dm_preview int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_wk text := public.aura_current_week_key();
  v_row record;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  SELECT COALESCE(p.aura_level, 1)
    INTO v_level
    FROM public.profiles p
   WHERE p.id = v_profile_id
   LIMIT 1;

  v_level := COALESCE(v_level, 1);

  SELECT c.*
    INTO v_row
    FROM public.oculto_aura_weekly_chests c
   WHERE c.week_key = v_wk
     AND public.aura_resolve_profile_id(c.user_id) = v_profile_id
   ORDER BY c.claimed_at DESC
   LIMIT 1;

  week_key := v_wk;
  claimed := v_row.id IS NOT NULL;
  claimed_at := v_row.claimed_at;
  next_claim_at := CASE
    WHEN v_row.id IS NULL THEN now()
    ELSE date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::timestamptz + interval '7 days'
  END;
  level := v_level;
  xp_preview := CASE
    WHEN v_row.id IS NOT NULL THEN COALESCE(v_row.xp_awarded, LEAST(500, 50 + (v_level - 1) * 25))
    ELSE LEAST(500, 50 + (v_level - 1) * 25)
  END;
  super_dm_preview := CASE
    WHEN v_row.id IS NOT NULL THEN COALESCE(v_row.super_dm_awarded, 0)
    ELSE CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
       + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
       + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END
  END;

  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 5) Recria aura_weekly_chest_claim() isolado por profile.id canônico.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_claim()
RETURNS TABLE(
  ok boolean,
  message text,
  xp_awarded int,
  super_dm_awarded int,
  level int,
  level_up boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_wk text := public.aura_current_week_key();
  v_level int;
  v_xp int;
  v_sdm int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF v_profile_id IS NULL THEN
    ok := false;
    message := 'Perfil não encontrado';
    xp_awarded := 0;
    super_dm_awarded := 0;
    level := 1;
    level_up := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.oculto_aura_weekly_chests c
     WHERE c.week_key = v_wk
       AND public.aura_resolve_profile_id(c.user_id) = v_profile_id
  ) THEN
    SELECT COALESCE(p.aura_level, 1)
      INTO v_level
      FROM public.profiles p
     WHERE p.id = v_profile_id;

    ok := false;
    message := 'Cofre desta semana já foi reivindicado';
    xp_awarded := 0;
    super_dm_awarded := 0;
    level := COALESCE(v_level, 1);
    level_up := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(p.aura_level, 1)
    INTO v_level
    FROM public.profiles p
   WHERE p.id = v_profile_id
   FOR UPDATE;

  v_level := COALESCE(v_level, 1);
  v_old_level := v_level;
  v_xp := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  INSERT INTO public.oculto_aura_weekly_chests
    (user_id, week_key, level_at_claim, xp_awarded, super_dm_awarded)
  VALUES
    (v_uid, v_wk, v_level, v_xp, v_sdm);

  UPDATE public.profiles p
     SET aura_xp = GREATEST(0, COALESCE(p.aura_xp, 0) + v_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(p.aura_xp, 0) + v_xp))
   WHERE p.id = v_profile_id
   RETURNING p.aura_xp, p.aura_level INTO v_new_xp, v_new_level;

  ok := true;
  message := 'Cofre reivindicado!';
  xp_awarded := v_xp;
  super_dm_awarded := v_sdm;
  level := COALESCE(v_new_level, v_level);
  level_up := COALESCE(v_new_level, v_level) > v_old_level;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 6) Recria aura_weekly_chest_history() para retornar só cofres do usuário.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_history(p_limit int DEFAULT 12)
RETURNS TABLE(
  week_key text,
  claimed_at timestamptz,
  level_at_claim int,
  xp_awarded int,
  super_dm_awarded int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid := public.aura_current_profile_id();
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 52);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  RETURN QUERY
  SELECT c.week_key,
         c.claimed_at,
         c.level_at_claim,
         c.xp_awarded,
         c.super_dm_awarded
    FROM public.oculto_aura_weekly_chests c
   WHERE public.aura_resolve_profile_id(c.user_id) = v_profile_id
   ORDER BY c.claimed_at DESC
   LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_claim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_history(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Diagnóstico DEPOIS.
-- ---------------------------------------------------------------------
SELECT 'DEPOIS — perfil andarilha' AS step,
       p.id,
       p.user_id,
       p.username,
       p.aura_xp,
       p.aura_level,
       p.created_at
  FROM public.profiles p
 WHERE lower(coalesce(p.username, '')) = 'andarilha'
 ORDER BY p.created_at ASC NULLS LAST;

SELECT 'DEPOIS — cofres ligados à andarilha' AS step,
       c.id AS chest_id,
       c.user_id AS chest_user_id,
       p.id AS matched_profile_id,
       p.user_id AS matched_auth_user_id,
       p.username,
       p.aura_xp AS profile_aura_xp,
       p.aura_level AS profile_aura_level,
       c.week_key,
       c.level_at_claim,
       c.xp_awarded,
       c.super_dm_awarded,
       c.claimed_at
  FROM public.oculto_aura_weekly_chests c
  JOIN public.profiles p
    ON p.id = public.aura_resolve_profile_id(c.user_id)
 WHERE lower(coalesce(p.username, '')) = 'andarilha'
 ORDER BY c.claimed_at DESC;

NOTIFY pgrst, 'reload schema';

COMMIT;